import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, identity, invite, pool, signIn } from './harness.mjs';

// ORD-001: meal orders — shared editing (AC-03), stale-revision conflicts (AC-04), idempotent
// submission and closing (AC-07), household-local scheduling and DST handling (AC-08),
// immutable recipe snapshots (AC-11), and household isolation (AC-02).

async function household(user, timezone = 'America/Toronto') {
  const response = await api(user, '/households', {
    method: 'POST',
    body: { name: 'Order home', timezone },
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function recipe(user, householdId, overrides = {}) {
  const response = await api(user, `/households/${householdId}/recipes`, {
    method: 'POST',
    body: {
      requestId: randomUUID(),
      name: 'Chicken rice',
      servings: 2,
      pricePoints: 3,
      steps: ['Cook.'],
      ingredients: [
        { name: 'Chicken breast', quantity: '200', unit: 'g', form: 'raw' },
        { name: 'Salt', note: 'to taste' },
      ],
      ...overrides,
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function order(user, householdId, body) {
  return api(user, `/households/${householdId}/orders`, {
    method: 'POST',
    body: { requestId: randomUUID(), when: { type: 'now' }, ...body },
  });
}

async function placed(user, householdId, body) {
  const response = await order(user, householdId, body);
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function auditActions(orderId) {
  const rows = await pool.query(
    'select action, revision from app.audit_events where entity_id=$1 order by id',
    [orderId],
  );
  return rows.rows.map((row) => `${row.action}@${row.revision}`);
}

/** YYYY-MM-DD for today + days, in a time zone. */
function localDate(timeZone, days = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

/** Next nth Sunday of a month (1-based month), at least a few days ahead, as YYYY-MM-DD. */
function nextNthSunday(month, nth) {
  const today = new Date();
  for (let year = today.getUTCFullYear(); ; year += 1) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (7 - first.getUTCDay()) % 7;
    const date = new Date(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7));
    if (date.getTime() > today.getTime() + 3 * 86_400_000) return date.toISOString().slice(0, 10);
  }
}

async function setup(timezone) {
  const owner = await signIn(identity('Owner'));
  const home = await household(owner, timezone);
  const dish = await recipe(owner, home.id);
  return { owner, home, dish, base: `/households/${home.id}/orders` };
}

async function withMember() {
  const context = await setup();
  const member = await signIn(identity('Member'));
  const link = await invite(context.owner, context.home.id);
  await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } });
  return { ...context, member };
}

test('an order snapshots its recipes, totals virtual points, and records an audit event', async () => {
  const { owner, home, dish, base } = await setup();
  const second = await recipe(owner, home.id, { name: '番茄炒蛋', pricePoints: 5, servings: 4 });
  const created = await placed(owner, home.id, {
    notes: '  Less salt please  ',
    items: [
      { recipeId: dish.id, servings: 3 },
      { recipeId: second.id, servings: 2 },
    ],
  });
  assert.equal(created.status, 'pending');
  assert.equal(created.revision, 1);
  assert.equal(created.notes, 'Less salt please');
  assert.equal(created.timezone, 'America/Toronto');
  assert.equal(created.mealDate, localDate('America/Toronto'));
  assert.equal(created.totalPoints, 3 * 3 + 5 * 2);
  assert.equal(created.createdBy, 'Owner');
  assert.deepEqual(
    created.items.map((item) => [item.recipeName, item.servings, item.recipeServings]),
    [
      ['Chicken rice', 3, 2],
      ['番茄炒蛋', 2, 4],
    ],
  );
  assert.deepEqual(created.items[0].ingredients[0], {
    name: 'Chicken breast',
    key: 'chicken breast',
    quantity: '200',
    unit: 'g',
    form: 'raw',
    note: null,
  });
  assert.deepEqual(created.items[0].steps, ['Cook.']);
  assert.deepEqual(await auditActions(created.id), ['create@1']);

  const pending = await (await api(owner, base)).json();
  assert.deepEqual(
    pending.map((row) => [row.id, row.items.length, row.totalPoints]),
    [[created.id, 2, 19]],
  );
  assert.ok(!('ingredients' in pending[0].items[0]), 'lists stay light');
  assert.deepEqual(await (await api(owner, `${base}?view=history`)).json(), []);
  assert.equal((await api(owner, `${base}?view=everything`)).status, 400);
});

test('AC-08: scheduled meals keep their household-local date across UTC midnight', async () => {
  const toronto = await setup('America/Toronto');
  const date = localDate('America/Toronto', 7);
  const late = await placed(toronto.owner, toronto.home.id, {
    when: { type: 'scheduled', date, time: '23:30' },
    items: [{ recipeId: toronto.dish.id, servings: 2 }],
  });
  assert.equal(late.mealDate, date);
  assert.equal(late.mealTime, '23:30');
  assert.equal(new Date(late.scheduledAt).getUTCDate() !== Number(date.slice(8)), true);

  const shanghai = await setup('Asia/Shanghai');
  const early = await placed(shanghai.owner, shanghai.home.id, {
    when: { type: 'scheduled', date: localDate('Asia/Shanghai', 7), time: '07:00' },
    items: [{ recipeId: shanghai.dish.id, servings: 1 }],
  });
  assert.equal(early.mealDate, localDate('Asia/Shanghai', 7));
  assert.equal(early.utcOffset, '+08:00');
  assert.equal(new Date(early.scheduledAt).getUTCHours(), 23, 'previous UTC day');

  // Pending orders are listed by meal time.
  const soon = await placed(toronto.owner, toronto.home.id, {
    when: { type: 'scheduled', date: localDate('America/Toronto', 1), time: '12:00' },
    items: [{ recipeId: toronto.dish.id, servings: 1 }],
  });
  const listed = await (await api(toronto.owner, toronto.base)).json();
  assert.deepEqual(
    listed.map((row) => row.id),
    [soon.id, late.id],
  );
});

test('AC-08: times skipped or repeated by daylight saving get explicit treatment', async () => {
  const { owner, home, dish } = await setup('America/Toronto');
  const items = [{ recipeId: dish.id, servings: 1 }];
  const spring = nextNthSunday(3, 2); // clocks jump 02:00 → 03:00
  const fall = nextNthSunday(11, 1); // clocks repeat 01:00–02:00

  const skipped = await order(owner, home.id, {
    when: { type: 'scheduled', date: spring, time: '02:30' },
    items,
  });
  assert.equal(skipped.status, 400);
  const skippedBody = await skipped.json();
  assert.equal(skippedBody.code, 'nonexistent_time');
  assert.match(skippedBody.message, /does not exist/);

  const repeated = await order(owner, home.id, {
    when: { type: 'scheduled', date: fall, time: '01:30' },
    items,
  });
  assert.equal(repeated.status, 400);
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.code, 'ambiguous_time');
  assert.deepEqual(repeatedBody.options, [
    { disambiguation: 'earlier', utcOffset: '-04:00' },
    { disambiguation: 'later', utcOffset: '-05:00' },
  ]);

  const earlier = await placed(owner, home.id, {
    when: { type: 'scheduled', date: fall, time: '01:30', disambiguation: 'earlier' },
    items,
  });
  const later = await placed(owner, home.id, {
    when: { type: 'scheduled', date: fall, time: '01:30', disambiguation: 'later' },
    items,
  });
  assert.equal(new Date(later.scheduledAt) - new Date(earlier.scheduledAt), 3_600_000);
  assert.deepEqual(
    [earlier.utcOffset, later.utcOffset, earlier.mealDate, later.mealTime],
    ['-04:00', '-05:00', fall, '01:30'],
  );
  const count = await pool.query(
    'select count(*)::int as count from app.meal_orders where household_id=$1',
    [home.id],
  );
  assert.equal(count.rows[0].count, 2, 'rejected times created nothing');
});

test('order input is validated', async () => {
  const { owner, home, dish } = await setup();
  const item = { recipeId: dish.id, servings: 1 };
  const cases = [
    { items: [] },
    { items: Array.from({ length: 21 }, () => item) },
    { items: [{ recipeId: dish.id, servings: 0 }] },
    { items: [{ recipeId: dish.id, servings: 1.5 }] },
    { items: [{ recipeId: 'nope', servings: 1 }] },
    { items: [{ recipeId: randomUUID(), servings: 1 }] },
    { items: [item], when: {} },
    { items: [item], when: { type: 'later' } },
    { items: [item], when: { type: 'scheduled', date: '2026-02-30', time: '12:00' } },
    { items: [item], when: { type: 'scheduled', date: '26-10-03', time: '12:00' } },
    { items: [item], when: { type: 'scheduled', date: localDate('UTC', 1), time: '24:00' } },
    { items: [item], when: { type: 'scheduled', date: localDate('UTC', 1), time: '7pm' } },
    { items: [item], when: { type: 'scheduled', date: localDate('UTC', 400), time: '12:00' } },
    { items: [item], when: { type: 'scheduled', date: localDate('UTC', -400), time: '12:00' } },
    {
      items: [item],
      when: { type: 'scheduled', date: localDate('UTC', 1), time: '12:00', disambiguation: 'x' },
    },
    { items: [item], notes: 'x'.repeat(1001) },
    { items: [item], notes: 5 },
    { items: [item], requestId: 'not-a-uuid' },
  ];
  for (const body of cases) {
    const response = await order(owner, home.id, body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 120));
  }
  const count = await pool.query(
    'select count(*)::int as count from app.meal_orders where household_id=$1',
    [home.id],
  );
  assert.equal(count.rows[0].count, 0);
});

test('AC-07: a repeated submission creates exactly one order, even concurrently', async () => {
  const { owner, home, dish, base } = await setup();
  const body = {
    requestId: randomUUID(),
    when: { type: 'now' },
    items: [{ recipeId: dish.id, servings: 2 }],
  };
  const responses = await Promise.all(
    [1, 2, 3].map(() => api(owner, base, { method: 'POST', body })),
  );
  assert.deepEqual(
    responses.map((response) => response.status),
    [201, 201, 201],
  );
  const ids = new Set(await Promise.all(responses.map(async (r) => (await r.json()).id)));
  assert.equal(ids.size, 1);
  const again = await api(owner, base, { method: 'POST', body: { ...body, notes: 'changed' } });
  assert.equal((await again.json()).notes, '', 'a replay returns the original order');
  const [id] = ids;
  assert.deepEqual(await auditActions(id), ['create@1']);
  const count = await pool.query(
    'select count(*)::int as count from app.meal_orders where household_id=$1',
    [home.id],
  );
  assert.equal(count.rows[0].count, 1);
});

test('AC-03: any member edits another member’s pending order; items keep or refresh snapshots', async () => {
  const { owner, member, home, dish } = await withMember();
  const extra = await recipe(owner, home.id, { name: 'Soup', pricePoints: 2 });
  const third = await recipe(owner, home.id, { name: 'Salad', pricePoints: 1 });
  const created = await placed(owner, home.id, {
    items: [
      { recipeId: dish.id, servings: 2 },
      { recipeId: extra.id, servings: 1 },
    ],
  });
  const path = `/households/${home.id}/orders/${created.id}`;
  const date = localDate('America/Toronto', 2);
  const response = await api(member, path, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      when: { type: 'scheduled', date, time: '18:00' },
      notes: 'Member changed this',
      items: [
        { recipeId: third.id, servings: 4 },
        { itemId: created.items[0].id, servings: 5 },
      ],
    },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const updated = await response.json();
  assert.equal(updated.revision, 2);
  assert.equal(updated.updatedBy, 'Member');
  assert.equal(updated.createdBy, 'Owner');
  assert.deepEqual([updated.mealDate, updated.mealTime], [date, '18:00']);
  assert.deepEqual(
    updated.items.map((item) => [item.recipeName, item.servings]),
    [
      ['Salad', 4],
      ['Chicken rice', 5],
    ],
  );
  assert.equal(updated.items[1].id, created.items[0].id, 'kept item keeps its id and snapshot');
  assert.equal(updated.items[1].snapshotAt, created.items[0].snapshotAt);
  assert.equal(updated.totalPoints, 1 * 4 + 3 * 5);
  assert.deepEqual(await auditActions(created.id), ['create@1', 'update@2']);

  const other = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 1 }] });
  for (const items of [
    [{ itemId: other.items[0].id, servings: 1 }],
    [
      { itemId: created.items[0].id, servings: 1 },
      { itemId: created.items[0].id, servings: 2 },
    ],
    [{ itemId: created.items[0].id, recipeId: dish.id, servings: 1 }],
  ]) {
    const rejected = await api(member, path, {
      method: 'PUT',
      body: { expectedRevision: 2, when: { type: 'now' }, items },
    });
    assert.equal(rejected.status, 400, JSON.stringify(items));
  }
  assert.equal((await (await api(owner, path)).json()).revision, 2);
});

test('AC-04: two members editing revision 1 cannot silently overwrite each other', async () => {
  const { owner, member, home, dish } = await withMember();
  const created = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 2 }] });
  const path = `/households/${home.id}/orders/${created.id}`;
  const edit = (user, notes, expectedRevision = 1) =>
    api(user, path, {
      method: 'PUT',
      body: {
        expectedRevision,
        when: { type: 'now' },
        notes,
        items: [{ itemId: created.items[0].id, servings: 3 }],
      },
    });
  const [a, b] = await Promise.all([edit(owner, 'owner note'), edit(member, 'member note')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const loser = a.status === 409 ? a : b;
  assert.match((await loser.json()).message, /Someone else changed this order/);
  const current = await (await api(owner, path)).json();
  assert.equal(current.notes, a.status === 200 ? 'owner note' : 'member note');
  assert.equal(current.revision, 2);
  assert.deepEqual(await auditActions(created.id), ['create@1', 'update@2']);

  // A stale completion is refused too.
  const stale = await api(member, `${path}/complete`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  assert.equal(stale.status, 409);
  assert.equal((await (await api(owner, path)).json()).status, 'pending');
});

test('AC-07: completing or cancelling twice has no second effect; closed orders are read-only', async () => {
  const { owner, member, home, dish, base } = await withMember();
  const first = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 2 }] });
  const path = `/households/${home.id}/orders/${first.id}`;
  const done = await Promise.all(
    [owner, member].map((user) =>
      api(user, `${path}/complete`, { method: 'POST', body: { expectedRevision: 1 } }),
    ),
  );
  assert.deepEqual(
    done.map((response) => response.status),
    [200, 200],
  );
  const completed = await done[0].json();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.revision, 2);
  assert.ok(completed.closedAt);
  assert.deepEqual(await auditActions(first.id), ['create@1', 'complete@2']);
  const repeat = await api(owner, `${path}/complete`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  assert.equal(repeat.status, 200);
  assert.equal((await repeat.json()).revision, 2);
  assert.equal(
    (await api(owner, `${path}/cancel`, { method: 'POST', body: { expectedRevision: 2 } })).status,
    409,
  );
  assert.equal(
    (
      await api(owner, path, {
        method: 'PUT',
        body: {
          expectedRevision: 2,
          when: { type: 'now' },
          items: [{ recipeId: dish.id, servings: 1 }],
        },
      })
    ).status,
    409,
  );

  const second = await placed(member, home.id, { items: [{ recipeId: dish.id, servings: 1 }] });
  const secondPath = `/households/${home.id}/orders/${second.id}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cancelled = await api(owner, `${secondPath}/cancel`, {
      method: 'POST',
      body: { expectedRevision: 1 },
    });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).closedBy, 'Owner');
  }
  assert.deepEqual(await auditActions(second.id), ['create@1', 'cancel@2']);
  assert.equal(
    (await api(owner, `${secondPath}/complete`, { method: 'POST', body: { expectedRevision: 2 } }))
      .status,
    409,
  );
  assert.equal((await api(owner, `${path}/complete`, { method: 'POST', body: {} })).status, 400);

  assert.deepEqual(await (await api(owner, base)).json(), []);
  const history = await (await api(member, `${base}?view=history`)).json();
  assert.deepEqual(
    history.map((row) => [row.id, row.status]),
    [
      [second.id, 'cancelled'],
      [first.id, 'completed'],
    ],
  );
});

test('AC-11: editing or archiving a recipe never rewrites existing orders or history', async () => {
  const { owner, home, dish } = await setup();
  const pending = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 2 }] });
  const closed = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 4 }] });
  await api(owner, `/households/${home.id}/orders/${closed.id}/complete`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  const before = {
    pending: await (await api(owner, `/households/${home.id}/orders/${pending.id}`)).json(),
    closed: await (await api(owner, `/households/${home.id}/orders/${closed.id}`)).json(),
  };

  const recipePath = `/households/${home.id}/recipes/${dish.id}`;
  const edited = await api(owner, recipePath, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      name: 'Renamed dish',
      servings: 6,
      pricePoints: 99,
      steps: ['Different method.'],
      ingredients: [{ name: 'Tofu', quantity: '1', unit: 'kg' }],
    },
  });
  assert.equal(edited.status, 200);
  await api(owner, `${recipePath}/archive`, { method: 'POST', body: { expectedRevision: 2 } });

  for (const [key, id] of [
    ['pending', pending.id],
    ['closed', closed.id],
  ]) {
    const now = await (await api(owner, `/households/${home.id}/orders/${id}`)).json();
    assert.deepEqual(now, before[key], `${key} order unchanged`);
    assert.equal(now.items[0].recipeName, 'Chicken rice');
    assert.equal(now.items[0].ingredients[0].name, 'Chicken breast');
  }

  // Changing servings on the pending order still uses its original snapshot.
  const reServed = await api(owner, `/households/${home.id}/orders/${pending.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      when: { type: 'now' },
      items: [{ itemId: pending.items[0].id, servings: 3 }],
    },
  });
  assert.equal(reServed.status, 200);
  const reServedBody = await reServed.json();
  assert.deepEqual(
    [reServedBody.items[0].recipeName, reServedBody.items[0].pricePoints, reServedBody.totalPoints],
    ['Chicken rice', 3, 9],
  );

  // Archived recipes cannot be newly ordered; restored ones take a fresh snapshot.
  const archivedOrder = await order(owner, home.id, {
    items: [{ recipeId: dish.id, servings: 1 }],
  });
  assert.equal(archivedOrder.status, 409);
  await api(owner, `${recipePath}/restore`, { method: 'POST', body: { expectedRevision: 3 } });
  const fresh = await placed(owner, home.id, { items: [{ recipeId: dish.id, servings: 1 }] });
  assert.deepEqual(
    [fresh.items[0].recipeName, fresh.items[0].pricePoints, fresh.items[0].recipeRevision],
    ['Renamed dish', 99, 4],
  );
});

test('AC-02: household A cannot see or change household B orders or order B recipes', async () => {
  const a = await setup();
  const b = await setup();
  const orderB = await placed(b.owner, b.home.id, {
    notes: 'Secret B note',
    items: [{ recipeId: b.dish.id, servings: 1 }],
  });
  const body = {
    expectedRevision: 1,
    when: { type: 'now' },
    items: [{ recipeId: a.dish.id, servings: 1 }],
  };
  const attempts = [
    ['GET', `/households/${b.home.id}/orders`],
    ['GET', `/households/${b.home.id}/orders?view=history`],
    ['POST', `/households/${b.home.id}/orders`, { requestId: randomUUID(), ...body }],
    ['GET', `/households/${b.home.id}/orders/${orderB.id}`],
    ['PUT', `/households/${b.home.id}/orders/${orderB.id}`, body],
    ['POST', `/households/${b.home.id}/orders/${orderB.id}/complete`, body],
    ['POST', `/households/${b.home.id}/orders/${orderB.id}/cancel`, body],
    ['GET', `/households/${a.home.id}/orders/${orderB.id}`],
    ['PUT', `/households/${a.home.id}/orders/${orderB.id}`, body],
    ['POST', `/households/${a.home.id}/orders/${orderB.id}/complete`, body],
    ['GET', `/households/${a.home.id}/orders/not-a-uuid`],
  ];
  for (const [method, path, requestBody] of attempts) {
    const response = await api(a.owner, path, { method, body: requestBody });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.ok(!(await response.text()).includes('Secret B'));
  }
  // B's recipe id cannot be ordered from A, and the error does not reveal it.
  const cross = await order(a.owner, a.home.id, { items: [{ recipeId: b.dish.id, servings: 1 }] });
  assert.equal(cross.status, 400);
  assert.ok(!(await cross.text()).includes('Chicken rice'));
  const stillB = await (await api(b.owner, `/households/${b.home.id}/orders/${orderB.id}`)).json();
  assert.deepEqual(stillB, orderB);
});

test('AC-03: removed members lose order access; writes need the CSRF token', async () => {
  const { owner, member, home, dish, base } = await withMember();
  const created = await placed(member, home.id, { items: [{ recipeId: dish.id, servings: 1 }] });
  const path = `/households/${home.id}/orders/${created.id}`;
  assert.equal(
    (
      await api(member, base, {
        method: 'POST',
        body: {
          requestId: randomUUID(),
          when: { type: 'now' },
          items: [{ recipeId: dish.id, servings: 1 }],
        },
        csrf: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(member, `${path}/cancel`, {
        method: 'POST',
        body: { expectedRevision: 1 },
        csrf: false,
      })
    ).status,
    403,
  );
  await api(owner, `/households/${home.id}/members/${member.id}`, { method: 'DELETE' });
  assert.equal((await api(member, base)).status, 404);
  assert.equal((await api(member, path)).status, 404);
  assert.equal(
    (await api(member, `${path}/cancel`, { method: 'POST', body: { expectedRevision: 1 } })).status,
    404,
  );
  const kept = await (await api(owner, path)).json();
  assert.equal(kept.status, 'pending');
  assert.equal(kept.createdBy, 'Member', 'orders by a removed member stay with the household');
});

test('database constraints keep order items in their household and closed state consistent', async () => {
  const a = await setup();
  const b = await setup();
  const orderA = await placed(a.owner, a.home.id, {
    items: [{ recipeId: a.dish.id, servings: 1 }],
  });
  const code = (promise) =>
    promise.then(
      () => 'ok',
      (error) => error.code,
    );
  assert.equal(
    await code(
      pool.query(
        `insert into app.meal_order_items (household_id, order_id, position, recipe_id, servings,
           recipe_name, recipe_servings, price_points, steps, ingredients, recipe_revision)
         values ($1, $2, 5, $3, 1, 'x', 1, 0, '{}', '[]', 1)`,
        [a.home.id, orderA.id, b.dish.id],
      ),
    ),
    '23503',
    'an item cannot reference another household recipe',
  );
  assert.equal(
    await code(
      pool.query("update app.meal_orders set status='completed' where id=$1", [orderA.id]),
    ),
    '23514',
    'closing requires closed_at/closed_by',
  );
  assert.equal(
    await code(pool.query('delete from app.recipes where id=$1', [a.dish.id])),
    '23503',
    'an ordered recipe cannot be deleted',
  );
});
