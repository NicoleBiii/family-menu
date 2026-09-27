import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  buildShoppingList,
  parseDecimal,
  present,
  rational,
  toDecimal,
} from '../../apps/api/dist/shopping.js';
import { api, identity, invite, signIn } from './harness.mjs';

// SHOP-001: ingredient demand from pending order snapshots (AC-09, AC-10) and isolation (AC-02).

// ---------- Pure calculation ----------

function row(recipeName, servings, recipeServings, ingredients, extra = {}) {
  return {
    orderId: extra.orderId ?? randomUUID(),
    mealDate: extra.mealDate ?? '2026-10-03',
    mealTime: extra.mealTime ?? '18:00',
    scheduledAt: new Date('2026-10-03T22:00:00Z'),
    itemId: randomUUID(),
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

const amountsOf = (list, key, form = null) =>
  list.combined.find((entry) => entry.key === key && entry.form === form)?.amounts;

test('exact decimals: no binary floating point, and inexact results round up', () => {
  assert.deepEqual(toDecimal(parseDecimal('0.1')), { quantity: '0.1', approximate: false });
  const sum = [parseDecimal('0.1'), parseDecimal('0.2')].reduce((a, b) =>
    rational(a.n * b.d + b.n * a.d, a.d * b.d),
  );
  assert.deepEqual(toDecimal(sum), { quantity: '0.3', approximate: false });
  assert.deepEqual(toDecimal(rational(1n, 3n)), { quantity: '0.334', approximate: true });
  assert.deepEqual(toDecimal(rational(2n, 3n)), { quantity: '0.667', approximate: true });
  assert.deepEqual(present(rational(1500n), 'mass-metric'), {
    quantity: '1.5',
    approximate: false,
    unit: 'kg',
  });
  assert.deepEqual(present(rational(999n), 'mass-metric'), {
    quantity: '999',
    approximate: false,
    unit: 'g',
  });
  assert.deepEqual(present(rational(72n), 'volume-spoon'), {
    quantity: '1.5',
    approximate: false,
    unit: 'cup',
  });
  assert.deepEqual(present(rational(50n), 'volume-spoon'), {
    quantity: '50',
    approximate: false,
    unit: 'tsp',
  });
  assert.deepEqual(present(rational(6n), 'volume-spoon'), {
    quantity: '2',
    approximate: false,
    unit: 'tbsp',
  });
  assert.deepEqual(present(rational(24n), 'mass-imperial'), {
    quantity: '1.5',
    approximate: false,
    unit: 'lb',
  });
});

test('AC-09: the chicken fixture totals 500 g; counts and unquantified lines stay separate', () => {
  const list = buildShoppingList([
    // Two-serving recipe with 200 g chicken, ordered for three servings: 300 g.
    row('Chicken rice', 3, 2, [
      { name: 'Chicken breast', key: 'chicken breast', quantity: '200', unit: 'g', form: 'raw' },
      { name: 'Salt', key: 'salt', note: 'to taste' },
    ]),
    // Another order needs 0.2 kg of the same chicken form.
    row('Chicken salad', 1, 1, [
      { name: 'chicken breast', key: 'chicken breast', quantity: '0.2', unit: 'kg', form: 'Raw' },
      { name: 'Salt', key: 'salt', note: 'a pinch' },
    ]),
    // Two whole breasts: a count, never converted into grams.
    row('Roast', 1, 1, [
      { name: 'Chicken breast', key: 'chicken breast', quantity: '2', unit: null, form: 'raw' },
    ]),
    // A different form is a different purchase.
    row('Leftovers', 1, 1, [
      { name: 'Chicken breast', key: 'chicken breast', quantity: '150', unit: 'g', form: 'cooked' },
    ]),
  ]);
  assert.deepEqual(amountsOf(list, 'chicken breast', 'raw'), [
    { quantity: '500', approximate: false, unit: 'g' },
    { quantity: '2', approximate: false, unit: null },
  ]);
  assert.deepEqual(amountsOf(list, 'chicken breast', 'cooked'), [
    { quantity: '150', approximate: false, unit: 'g' },
  ]);
  const salt = list.combined.find((entry) => entry.key === 'salt');
  assert.deepEqual(salt.amounts, []);
  assert.deepEqual(salt.unquantified.sort(), ['a pinch', 'to taste']);
  const raw = list.combined.find((entry) => entry.key === 'chicken breast' && entry.form === 'raw');
  assert.deepEqual(raw.dishes, ['Chicken rice', 'Chicken salad', 'Roast']);
  assert.equal(raw.lineCount, 3);
});

test('incompatible units are never merged; compatible ones convert exactly', () => {
  const list = buildShoppingList([
    row('A', 1, 1, [
      { name: 'Milk', quantity: '500', unit: 'ml' },
      { name: 'Milk', quantity: '1', unit: 'cup' },
      { name: 'Flour', quantity: '1', unit: 'lb' },
      { name: 'Flour', quantity: '200', unit: 'g' },
      { name: 'Garlic', quantity: '2', unit: 'clove' },
      { name: 'Garlic', quantity: '1', unit: null },
      { name: 'Sugar', quantity: '1', unit: 'tbsp' },
      { name: 'Sugar', quantity: '1', unit: 'tsp' },
    ]),
    row('B', 1, 1, [
      { name: 'Milk', quantity: '0.75', unit: 'l' },
      { name: 'Flour', quantity: '8', unit: 'oz' },
      { name: 'Garlic', quantity: '3', unit: 'clove' },
    ]),
  ]);
  assert.deepEqual(amountsOf(list, 'milk'), [
    { quantity: '1.25', approximate: false, unit: 'l' },
    { quantity: '1', approximate: false, unit: 'cup' },
  ]);
  assert.deepEqual(amountsOf(list, 'flour'), [
    { quantity: '200', approximate: false, unit: 'g' },
    { quantity: '1.5', approximate: false, unit: 'lb' },
  ]);
  assert.deepEqual(amountsOf(list, 'garlic'), [
    { quantity: '1', approximate: false, unit: null },
    { quantity: '5', approximate: false, unit: 'clove' },
  ]);
  assert.deepEqual(amountsOf(list, 'sugar'), [{ quantity: '4', approximate: false, unit: 'tsp' }]);
});

test('scaling to servings that do not divide evenly rounds up and is flagged', () => {
  const list = buildShoppingList([
    row('Omelette', 1, 3, [{ name: 'Egg', quantity: '2', unit: null }]),
    row('Omelette', 1, 3, [{ name: 'Egg', quantity: '2', unit: null }]),
  ]);
  // 2/3 + 2/3 = 4/3 eggs.
  assert.deepEqual(amountsOf(list, 'egg'), [{ quantity: '1.334', approximate: true, unit: null }]);
  assert.deepEqual(list.grouped[0].orders[0].items[0].ingredients[0], {
    name: 'Egg',
    form: null,
    note: null,
    quantity: '0.667',
    unit: null,
    approximate: true,
  });
});

// ---------- API ----------

async function setup() {
  const owner = await signIn(identity('Owner'));
  const home = await (
    await api(owner, '/households', { method: 'POST', body: { name: 'Shop home' } })
  ).json();
  const saveRecipe = async (body) => {
    const response = await api(owner, `/households/${home.id}/recipes`, {
      method: 'POST',
      body: { requestId: randomUUID(), steps: [], ...body },
    });
    assert.equal(response.status, 201);
    return response.json();
  };
  const chickenRice = await saveRecipe({
    name: 'Chicken rice',
    servings: 2,
    ingredients: [
      { name: 'Chicken breast', quantity: '200', unit: 'g', form: 'raw' },
      { name: 'Rice', quantity: '150', unit: 'g' },
      { name: 'Salt', note: 'to taste' },
    ],
  });
  const salad = await saveRecipe({
    name: 'Chicken salad',
    servings: 1,
    ingredients: [
      { name: 'chicken breast', quantity: '0.2', unit: 'kg', form: 'raw' },
      { name: 'Lettuce', quantity: '1', unit: 'piece' },
    ],
  });
  return { owner, home, chickenRice, salad, path: `/households/${home.id}/shopping` };
}

async function placeOrder(user, householdId, items, when = { type: 'now' }) {
  const response = await api(user, `/households/${householdId}/orders`, {
    method: 'POST',
    body: { requestId: randomUUID(), when, items },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function day(offset) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

/** Totals implied by the grouped view, to compare with the combined view. */
function groupedTotals(list) {
  const totals = {};
  for (const group of list.grouped)
    for (const order of group.orders)
      for (const item of order.items)
        for (const line of item.ingredients) {
          if (line.quantity === null) continue;
          const key = `${line.name.toLowerCase()}|${line.unit}`;
          totals[key] = (totals[key] ?? 0) + Number(line.quantity);
        }
  return totals;
}

test('AC-09/AC-10: the API computes the chicken fixture and both views show the same demand', async () => {
  const { owner, home, chickenRice, salad, path } = await setup();
  const empty = await (await api(owner, path)).json();
  assert.deepEqual([empty.orderCount, empty.combined, empty.grouped], [0, [], []]);

  await placeOrder(owner, home.id, [{ recipeId: chickenRice.id, servings: 3 }], {
    type: 'scheduled',
    date: day(1),
    time: '18:00',
  });
  await placeOrder(owner, home.id, [{ recipeId: salad.id, servings: 1 }], {
    type: 'scheduled',
    date: day(2),
    time: '12:00',
  });
  const list = await (await api(owner, path)).json();
  assert.equal(list.orderCount, 2);
  assert.ok(Date.parse(list.generatedAt) <= Date.now());
  assert.deepEqual(amountsOf(list, 'chicken breast', 'raw'), [
    { quantity: '500', approximate: false, unit: 'g' },
  ]);
  assert.deepEqual(amountsOf(list, 'rice'), [{ quantity: '225', approximate: false, unit: 'g' }]);
  assert.deepEqual(list.combined.find((entry) => entry.key === 'salt').unquantified, ['to taste']);

  assert.deepEqual(
    list.grouped.map((group) => [group.mealDate, group.orders.length]),
    [
      [day(1), 1],
      [day(2), 1],
    ],
  );
  const first = list.grouped[0].orders[0];
  assert.equal(first.mealTime, '18:00');
  assert.deepEqual(
    first.items[0].ingredients.map((line) => [line.name, line.quantity, line.unit]),
    [
      ['Chicken breast', '300', 'g'],
      ['Rice', '225', 'g'],
      ['Salt', null, null],
    ],
  );
  // Same demand in both views: 300 g + 0.2 kg in the grouped view equals the combined 500 g.
  const totals = groupedTotals(list);
  assert.equal(totals['chicken breast|g'] + totals['chicken breast|kg'] * 1000, 500);

  const scoped = await (await api(owner, `${path}?from=${day(2)}&to=${day(2)}`)).json();
  assert.equal(scoped.orderCount, 1);
  assert.deepEqual(scoped.scope, { from: day(2), to: day(2) });
  assert.deepEqual(amountsOf(scoped, 'chicken breast', 'raw'), [
    { quantity: '200', approximate: false, unit: 'g' },
  ]);
});

test('AC-10: editing, cancelling and completing orders change pending totals; overdue orders count', async () => {
  const { owner, home, chickenRice, path } = await setup();
  const member = await signIn(identity('Member'));
  const link = await invite(owner, home.id);
  await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } });

  const overdue = await placeOrder(owner, home.id, [{ recipeId: chickenRice.id, servings: 2 }], {
    type: 'scheduled',
    date: day(-2),
    time: '18:00',
  });
  const upcoming = await placeOrder(member, home.id, [{ recipeId: chickenRice.id, servings: 4 }]);
  const chicken = async (user = owner) =>
    amountsOf(await (await api(user, path)).json(), 'chicken breast', 'raw');
  assert.deepEqual(await chicken(member), [{ quantity: '600', approximate: false, unit: 'g' }]);

  const edited = await api(member, `/households/${home.id}/orders/${upcoming.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      when: { type: 'now' },
      items: [{ itemId: upcoming.items[0].id, servings: 1 }],
    },
  });
  assert.equal(edited.status, 200);
  assert.deepEqual(await chicken(), [{ quantity: '300', approximate: false, unit: 'g' }]);

  // Recipe edits do not change demand of existing orders (snapshots).
  await api(owner, `/households/${home.id}/recipes/${chickenRice.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      name: 'Chicken rice',
      servings: 2,
      ingredients: [{ name: 'Chicken breast', quantity: '999', unit: 'g', form: 'raw' }],
    },
  });
  assert.deepEqual(await chicken(), [{ quantity: '300', approximate: false, unit: 'g' }]);

  await api(owner, `/households/${home.id}/orders/${overdue.id}/cancel`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  assert.deepEqual(await chicken(), [{ quantity: '100', approximate: false, unit: 'g' }]);
  await api(owner, `/households/${home.id}/orders/${upcoming.id}/complete`, {
    method: 'POST',
    body: { expectedRevision: 2 },
  });
  const final = await (await api(owner, path)).json();
  assert.deepEqual([final.orderCount, final.combined, final.grouped], [0, [], []]);
});

test('AC-02: shopping lists are household-scoped; invalid ranges are rejected', async () => {
  const a = await setup();
  const b = await setup();
  await placeOrder(b.owner, b.home.id, [{ recipeId: b.chickenRice.id, servings: 2 }]);
  for (const path of [
    b.path,
    `/households/${randomUUID()}/shopping`,
    '/households/nope/shopping',
  ]) {
    const response = await api(a.owner, path);
    assert.equal(response.status, 404, path);
  }
  const own = await (await api(a.owner, a.path)).json();
  assert.equal(own.orderCount, 0, "B's orders never appear in A's list");
  for (const query of ['from=2026-13-01', 'to=tomorrow', `from=${day(2)}&to=${day(1)}`]) {
    assert.equal((await api(a.owner, `${a.path}?${query}`)).status, 400, query);
  }
  assert.equal((await api(null, a.path)).status, 401);
});
