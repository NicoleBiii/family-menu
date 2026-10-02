import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildChecklist, lineIdOf, rational } from '../../apps/api/dist/shopping.js';
import { api, identity, invite, pool, signIn } from './harness.mjs';

// UX-002 phase 4 (ADR 0009): shared shopping checks reconciled against order items, purchase
// history, undo, stale/concurrent checks, scope and household isolation (AC-02).

// ---------- Pure reconciliation ----------

function row(itemId, servings, recipeServings, ingredients, recipeName = 'Dish') {
  return {
    orderId: randomUUID(),
    mealDate: '2026-10-03',
    mealTime: '18:00',
    scheduledAt: new Date('2026-10-03T22:00:00Z'),
    itemId,
    recipeName,
    servings,
    recipeServings,
    ingredients: ingredients.map((line) => ({
      quantity: null,
      unit: null,
      form: null,
      note: null,
      key: line.name.toLowerCase(),
      ...line,
    })),
  };
}

const eggs = { name: 'Egg', quantity: '2' };
const line = (list, family = 'count:') => list.find((entry) => entry.family === family);

test('reconciliation: only demand added after a purchase is still to buy', () => {
  const a = randomUUID();
  const b = randomUUID();
  const [before] = buildChecklist([row(a, 1, 1, [eggs])], []);
  assert.equal(before.state, 'open');
  assert.deepEqual(before.toBuy, { quantity: '2', approximate: false, unit: null });

  const bought = {
    purchaseId: randomUUID(),
    itemId: a,
    key: 'egg',
    formKey: '',
    family: 'count:',
    quantity: rational(2n),
    purchasedBy: 'Ana',
    purchasedAt: new Date(),
  };
  const [covered] = buildChecklist([row(a, 1, 1, [eggs])], [bought]);
  assert.equal(covered.state, 'bought');
  assert.equal(covered.toBuy, null);
  assert.equal(covered.bought.quantity, '2');

  const [grown] = buildChecklist([row(a, 1, 1, [eggs]), row(b, 1, 1, [eggs])], [bought]);
  assert.equal(grown.state, 'open');
  assert.equal(grown.toBuy.quantity, '2', 'only the new order’s eggs');
  assert.equal(grown.bought.quantity, '2');
  assert.equal(grown.partlyBought, true);
  assert.deepEqual(
    grown.outstanding.map((entry) => entry.itemId),
    [b],
  );

  // A shrunk order keeps its spare amount; it never covers another order.
  const [shrunk] = buildChecklist([row(a, 1, 2, [eggs]), row(b, 1, 1, [eggs])], [bought]);
  assert.equal(shrunk.toBuy.quantity, '2');
  assert.equal(shrunk.bought.quantity, '1', 'bought shows only what current demand needed');

  // Allocations to items outside the demand (closed orders) are ignored.
  const [later] = buildChecklist([row(b, 1, 1, [eggs])], [bought]);
  assert.equal(later.toBuy.quantity, '2');
  assert.equal(later.bought, null);
});

test('reconciliation: exact rationals reach zero; units, forms and "to taste" stay apart', () => {
  const item = randomUUID();
  const third = { name: 'Saffron', quantity: '1', unit: 'g' };
  const [open] = buildChecklist([row(item, 1, 3, [third])], []);
  assert.deepEqual(open.toBuy, { quantity: '0.334', approximate: true, unit: 'g' });
  const [done] = buildChecklist(
    [row(item, 1, 3, [third])],
    [
      {
        purchaseId: randomUUID(),
        itemId: item,
        key: 'saffron',
        formKey: '',
        family: 'mass-metric',
        quantity: rational(1n, 3n),
        purchasedBy: 'Ana',
        purchasedAt: new Date(),
      },
    ],
  );
  assert.equal(done.state, 'bought', '1/3 g covered exactly; nothing left to round up');

  const list = buildChecklist(
    [
      row(randomUUID(), 1, 1, [
        eggs,
        { name: 'Egg', quantity: '100', unit: 'g' },
        { name: 'Egg', quantity: '1', form: 'boiled' },
        { name: 'Egg', note: 'for glazing' },
        { name: 'Egg', quantity: '1' },
      ]),
    ],
    [],
  );
  assert.deepEqual(
    list.map((entry) => [entry.form, entry.family, entry.toBuy?.quantity ?? null]),
    [
      [null, 'count:', '3'],
      [null, 'mass-metric', '100'],
      [null, 'unquantified', null],
      ['boiled', 'count:', '1'],
    ],
  );
  assert.deepEqual(line(list, 'unquantified').notes, ['for glazing']);
  assert.equal(new Set(list.map((entry) => entry.lineId)).size, 4);
  assert.equal(line(list).lineId, lineIdOf({ key: 'egg', formKey: '', family: 'count:' }));
});

// ---------- API ----------

async function household() {
  const owner = await signIn(identity('Shopper Ana'));
  const home = await (
    await api(owner, '/households', { method: 'POST', body: { name: 'Purchase home' } })
  ).json();
  const member = await signIn(identity('Shopper Ben'));
  const link = await invite(owner, home.id);
  assert.equal(
    (await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } }))
      .status,
    200,
  );
  const recipe = async (name, servings, ingredients) => {
    const response = await api(owner, `/households/${home.id}/recipes`, {
      method: 'POST',
      body: { requestId: randomUUID(), name, servings, steps: [], ingredients },
    });
    assert.equal(response.status, 201);
    return response.json();
  };
  const base = `/households/${home.id}/shopping`;
  return { owner, member, home, recipe, base };
}

async function order(user, householdId, items, when = { type: 'now' }) {
  const response = await api(user, `/households/${householdId}/orders`, {
    method: 'POST',
    body: { requestId: randomUUID(), when, items },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function checklist(user, base, query = '') {
  const response = await api(user, `${base}${query}`);
  assert.equal(response.status, 200);
  return (await response.json()).checklist;
}

function check(user, base, entry, extra = {}) {
  return api(user, `${base}/purchases`, {
    method: 'POST',
    body: { requestId: randomUUID(), lineId: entry.lineId, token: entry.token, ...extra },
  });
}

const find = (list, key, family = 'count:') =>
  list.find((entry) => entry.key === key && entry.family === family);

function day(offset) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

test('the egg example: bought eggs stay bought, new demand returns, history survives closing', async () => {
  const { owner, member, home, recipe, base } = await household();
  const omelette = await recipe('Omelette', 1, [{ name: 'Egg', quantity: '2' }]);
  const first = await order(owner, home.id, [{ recipeId: omelette.id, servings: 1 }]);

  const [open] = await checklist(member, base);
  assert.equal(open.toBuy.quantity, '2');
  const bought = await check(member, base, open);
  assert.equal(bought.status, 201, await bought.clone().text());
  const purchase = await bought.json();
  assert.equal(purchase.purchasedBy, 'Shopper Ben');
  assert.deepEqual(purchase.amount, { quantity: '2', approximate: false, unit: null });
  assert.equal(purchase.undoneAt, null);

  let egg = find(await checklist(owner, base), 'egg');
  assert.equal(egg.state, 'bought', 'every member sees the shared check');
  assert.equal(egg.bought.quantity, '2');
  assert.deepEqual(
    egg.purchases.map((entry) => entry.by),
    ['Shopper Ben'],
  );

  const second = await order(member, home.id, [{ recipeId: omelette.id, servings: 1 }]);
  egg = find(await checklist(owner, base), 'egg');
  assert.equal(egg.state, 'open');
  assert.equal(egg.toBuy.quantity, '2', 'only the added order’s 2 eggs');
  assert.equal(egg.bought.quantity, '2');
  assert.equal(egg.partlyBought, true);

  // Raising servings on the first order adds only the difference.
  const detail = await (await api(owner, `/households/${home.id}/orders/${first.id}`)).json();
  const raised = await api(owner, `/households/${home.id}/orders/${first.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: detail.revision,
      when: { type: 'scheduled', date: detail.mealDate, time: detail.mealTime },
      notes: '',
      items: [{ itemId: detail.items[0].id, servings: 3 }],
    },
  });
  assert.equal(raised.status, 200);
  assert.equal(find(await checklist(owner, base), 'egg').toBuy.quantity, '6');

  // Completing the first order removes its demand; its purchase does not cover the second.
  const done = await api(owner, `/households/${home.id}/orders/${first.id}/complete`, {
    method: 'POST',
    body: { expectedRevision: detail.revision + 1 },
  });
  assert.equal(done.status, 200);
  egg = find(await checklist(owner, base), 'egg');
  assert.equal(egg.toBuy.quantity, '2');
  assert.equal(egg.bought, null);

  // Cancelling the second order empties the list; history keeps the purchase.
  const cancelled = await api(owner, `/households/${home.id}/orders/${second.id}/cancel`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  assert.equal(cancelled.status, 200);
  assert.deepEqual(await checklist(owner, base), []);
  const history = await (await api(owner, `${base}/purchases`)).json();
  assert.deepEqual(
    history.map((entry) => [entry.name, entry.amount.quantity, entry.purchasedBy]),
    [['Egg', '2', 'Shopper Ben']],
  );
});

test('stale and concurrent checks record one purchase; a retried request id is idempotent', async () => {
  const { owner, member, home, recipe, base } = await household();
  const soup = await recipe('Soup', 2, [
    { name: 'Carrot', quantity: '3' },
    { name: 'Salt', note: 'to taste' },
  ]);
  await order(owner, home.id, [{ recipeId: soup.id, servings: 2 }]);
  const seenByBoth = find(await checklist(owner, base), 'carrot');

  const attempts = [owner, member].map((user) => ({
    user,
    body: { requestId: randomUUID(), lineId: seenByBoth.lineId, token: seenByBoth.token },
  }));
  const responses = await Promise.all(
    attempts.map(({ user, body }) => api(user, `${base}/purchases`, { method: 'POST', body })),
  );
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const conflict = await responses.find((response) => response.status === 409).json();
  assert.equal(conflict.code, 'shopping_changed');
  const winner = attempts[responses.findIndex((response) => response.status === 201)];
  const first = await responses.find((response) => response.status === 201).json();
  const retry = await api(winner.user, `${base}/purchases`, { method: 'POST', body: winner.body });
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).id, first.id, 'a retried request returns the first purchase');
  const purchases = await pool.query(
    'select count(*)::int as n from app.shopping_purchases where household_id = $1',
    [home.id],
  );
  assert.equal(purchases.rows[0].n, 1);

  // An order change after loading makes the old token stale.
  const salt = find(await checklist(owner, base), 'salt', 'unquantified');
  await order(member, home.id, [{ recipeId: soup.id, servings: 1 }]);
  const stale = await check(owner, base, salt);
  assert.equal(stale.status, 409);
  const fresh = find(await checklist(owner, base), 'salt', 'unquantified');
  assert.equal((await check(owner, base, fresh)).status, 201);
  assert.equal(find(await checklist(owner, base), 'salt', 'unquantified').state, 'bought');

  // "To taste" reappears when a new dish needs it.
  await order(member, home.id, [{ recipeId: soup.id, servings: 2 }]);
  const again = find(await checklist(owner, base), 'salt', 'unquantified');
  assert.equal(again.state, 'open');
  assert.equal(again.partlyBought, true);

  for (const invalid of [
    { requestId: 'x', lineId: fresh.lineId, token: fresh.token },
    { requestId: randomUUID(), lineId: 'not-a-line', token: fresh.token },
    { requestId: randomUUID(), lineId: fresh.lineId },
  ]) {
    assert.equal(
      (await api(owner, `${base}/purchases`, { method: 'POST', body: invalid })).status,
      400,
    );
  }
  const noCsrf = await api(owner, `${base}/purchases`, {
    method: 'POST',
    csrf: false,
    body: { requestId: randomUUID(), lineId: again.lineId, token: again.token },
  });
  assert.equal(noCsrf.status, 403);
});

test('undo reopens the line once; undone purchases stay in history and the audit record', async () => {
  const { owner, member, home, recipe, base } = await household();
  const toast = await recipe('Toast', 1, [{ name: 'Bread', quantity: '2', unit: 'slice' }]);
  await order(owner, home.id, [{ recipeId: toast.id, servings: 1 }]);
  const bought = await (
    await check(owner, base, find(await checklist(owner, base), 'bread', 'count:slice'))
  ).json();

  const undo = () => api(member, `${base}/purchases/${bought.id}/undo`, { method: 'POST' });
  const first = await undo();
  assert.equal(first.status, 200);
  const undone = await first.json();
  assert.equal(undone.undoneBy, 'Shopper Ben');
  assert.ok(undone.undoneAt);
  const repeat = await (await undo()).json();
  assert.equal(repeat.undoneAt, undone.undoneAt, 'a second undo changes nothing');

  const bread = find(await checklist(owner, base), 'bread', 'count:slice');
  assert.equal(bread.state, 'open');
  assert.equal(bread.toBuy.quantity, '2');
  const history = await (await api(owner, `${base}/purchases`)).json();
  assert.equal(history[0].undoneBy, 'Shopper Ben');
  const audit = await pool.query(
    `select action from app.audit_events where entity_type = 'shopping_purchase' and entity_id = $1 order by id`,
    [bought.id],
  );
  assert.deepEqual(
    audit.rows.map((entry) => entry.action),
    ['check', 'undo'],
  );
  assert.equal(
    (await api(owner, `${base}/purchases/${randomUUID()}/undo`, { method: 'POST' })).status,
    404,
  );
});

test('a check under a date range covers only those meals; by-day demand is unchanged', async () => {
  const { owner, home, recipe, base } = await household();
  const rice = await recipe('Rice', 1, [{ name: 'Rice', quantity: '100', unit: 'g' }]);
  await order(owner, home.id, [{ recipeId: rice.id, servings: 1 }], {
    type: 'scheduled',
    date: day(1),
    time: '18:00',
  });
  await order(owner, home.id, [{ recipeId: rice.id, servings: 2 }], {
    type: 'scheduled',
    date: day(2),
    time: '18:00',
  });
  const before = await (await api(owner, base)).json();
  const scoped = `?from=${day(1)}&to=${day(1)}`;
  const [tomorrow] = await checklist(owner, base, scoped);
  assert.equal(tomorrow.toBuy.quantity, '100');
  const bought = await check(owner, base, tomorrow, { from: day(1), to: day(1) });
  assert.equal(bought.status, 201);
  assert.equal((await bought.json()).amount.quantity, '100');

  const [all] = await checklist(owner, base);
  assert.equal(all.toBuy.quantity, '200', 'the later meal is still to buy');
  assert.equal(all.bought.quantity, '100');
  const after = await (await api(owner, base)).json();
  assert.deepEqual(after.grouped, before.grouped, 'the by-day view still shows full demand');
  assert.deepEqual(after.combined, before.combined);
});

test('removing a dish drops its allocation but keeps history; re-adding it is to buy again', async () => {
  const { owner, home, recipe, base } = await household();
  const pasta = await recipe('Pasta', 1, [{ name: 'Tomato', quantity: '2' }]);
  const salad = await recipe('Salad', 1, [{ name: 'Tomato', quantity: '1' }]);
  const placed = await order(owner, home.id, [
    { recipeId: pasta.id, servings: 1 },
    { recipeId: salad.id, servings: 1 },
  ]);
  const tomato = find(await checklist(owner, base), 'tomato');
  assert.equal(tomato.toBuy.quantity, '3');
  assert.deepEqual(tomato.dishes, ['Pasta', 'Salad']);
  await check(owner, base, tomato);

  const detail = await (await api(owner, `/households/${home.id}/orders/${placed.id}`)).json();
  const edited = await api(owner, `/households/${home.id}/orders/${placed.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: detail.revision,
      when: { type: 'scheduled', date: detail.mealDate, time: detail.mealTime },
      notes: '',
      items: [
        { itemId: detail.items[0].id, servings: 1 },
        { recipeId: salad.id, servings: 1 },
      ],
    },
  });
  assert.equal(edited.status, 200, await edited.clone().text());
  const after = find(await checklist(owner, base), 'tomato');
  assert.equal(after.toBuy.quantity, '1', 'the re-added salad is a new dish');
  assert.equal(after.bought.quantity, '2');
  const allocations = await pool.query(
    'select count(*)::int as n from app.shopping_allocations where household_id = $1',
    [home.id],
  );
  assert.equal(allocations.rows[0].n, 1);
  assert.equal((await (await api(owner, `${base}/purchases`)).json())[0].amount.quantity, '3');
});

test('AC-02: other households and removed members cannot read, check or undo purchases', async () => {
  const { owner, member, home, recipe, base } = await household();
  const tea = await recipe('Tea', 1, [{ name: 'Tea leaves', quantity: '5', unit: 'g' }]);
  await order(owner, home.id, [{ recipeId: tea.id, servings: 1 }]);
  const [entry] = await checklist(owner, base);
  const purchase = await (await check(owner, base, entry)).json();

  const stranger = await signIn(identity('Stranger'));
  const otherHome = await (
    await api(stranger, '/households', { method: 'POST', body: { name: 'Elsewhere' } })
  ).json();
  assert.equal((await api(stranger, base)).status, 404);
  assert.equal((await api(stranger, `${base}/purchases`)).status, 404);
  assert.equal((await check(stranger, base, entry)).status, 404);
  assert.equal(
    (await api(stranger, `${base}/purchases/${purchase.id}/undo`, { method: 'POST' })).status,
    404,
  );
  const ownRoute = `/households/${otherHome.id}/shopping`;
  assert.equal(
    (await api(stranger, `${ownRoute}/purchases/${purchase.id}/undo`, { method: 'POST' })).status,
    404,
    'a purchase id from another household is not found through the caller’s own household',
  );
  assert.equal((await check(stranger, ownRoute, entry)).status, 409, 'no such line there');
  assert.deepEqual(await (await api(stranger, `${ownRoute}/purchases`)).json(), []);

  const memberProfile = await pool.query(
    `select m.user_id from app.household_members m join app.user_profiles p on p.id = m.user_id
     where m.household_id = $1 and p.display_name = 'Shopper Ben'`,
    [home.id],
  );
  const removed = await api(
    owner,
    `/households/${home.id}/members/${memberProfile.rows[0].user_id}`,
    {
      method: 'DELETE',
    },
  );
  assert.equal(removed.status, 204, await removed.clone().text());
  assert.equal((await api(member, `${base}/purchases`)).status, 404);
  assert.equal(
    (await api(member, `${base}/purchases/${purchase.id}/undo`, { method: 'POST' })).status,
    404,
  );
  const stored = await pool.query('select undone_at from app.shopping_purchases where id = $1', [
    purchase.id,
  ]);
  assert.equal(stored.rows[0].undone_at, null);
});
