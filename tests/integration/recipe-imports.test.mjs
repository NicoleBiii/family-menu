import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, identity, pool, signIn } from './harness.mjs';

async function createHousehold(user) {
  const response = await api(user, '/households', {
    method: 'POST',
    body: { name: 'Import household' },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

const dish = (name, category = 'Home cooking') => ({
  name,
  category,
  servings: 2,
  pricePoints: 0,
  ingredients: [
    { name: 'Tomato', quantity: '300', unit: 'g' },
    { name: 'Salt', quantity: null, unit: null },
  ],
  steps: ['Cook and serve.'],
});
const text = (...recipes) => JSON.stringify({ version: 1, recipes });
const route = (id) => `/households/${id}/recipe-imports`;
const preview = (user, id, content) =>
  api(user, `${route(id)}/preview`, { method: 'POST', body: { text: content } });
const commit = (user, id, body) => api(user, route(id), { method: 'POST', body });

test('preview is write-free; commit creates categories and recipes once with a durable retry receipt', async () => {
  const owner = await signIn(identity('Importer'));
  const home = await createHousehold(owner);
  const content = text(dish('Tomato eggs'), dish('Tomato soup', 'Soups'));
  const check = await preview(owner, home.id, content);
  assert.equal(check.status, 200, await check.clone().text());
  const data = await check.json();
  assert.equal(data.rows.length, 2);
  assert.deepEqual(
    data.rows.map((r) => r.duplicate),
    [null, null],
  );
  assert.equal(
    (
      await pool.query('select count(*)::int as n from app.recipes where household_id=$1', [
        home.id,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'select count(*)::int as n from app.recipe_categories where household_id=$1',
        [home.id],
      )
    ).rows[0].n,
    0,
  );

  const body = {
    text: content,
    requestId: randomUUID(),
    selected: [0, 1],
    keepDuplicates: [],
    categoryChoices: { 'home cooking': 'create', soups: 'create' },
    stateHash: data.stateHash,
  };
  const saved = await commit(owner, home.id, body);
  assert.equal(saved.status, 200, await saved.clone().text());
  const result = await saved.json();
  assert.equal(result.imported, 2);
  assert.equal(result.createdCategories, 2);
  assert.equal(result.recipeIds.length, 2);
  const retry = await commit(owner, home.id, body);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), result);
  assert.equal((await commit(owner, home.id, { ...body, selected: [0] })).status, 409);
  assert.equal(
    (
      await pool.query('select count(*)::int as n from app.recipes where household_id=$1', [
        home.id,
      ])
    ).rows[0].n,
    2,
  );
  const recipe = await api(owner, `/households/${home.id}/recipes/${result.recipeIds[0]}`);
  assert.deepEqual(
    (await recipe.json()).ingredients.map((i) => i.quantity),
    ['300', null],
  );
});

test('invalid rows cannot commit; duplicates and concurrent changes require a new preview', async () => {
  const user = await signIn(identity('Reviewer'));
  const home = await createHousehold(user);
  const badText = text(dish('Good'), { ...dish('Broken'), servings: 0 });
  const check = await (await preview(user, home.id, badText)).json();
  assert.ok(check.rows[1].errors.length);
  assert.equal(
    (
      await commit(user, home.id, {
        text: badText,
        requestId: randomUUID(),
        selected: [0, 1],
        keepDuplicates: [],
        categoryChoices: { 'home cooking': 'create' },
        stateHash: check.stateHash,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await pool.query('select count(*)::int as n from app.recipes where household_id=$1', [
        home.id,
      ])
    ).rows[0].n,
    0,
  );

  const content = text(dish('Same'), dish('Same'));
  const first = await (await preview(user, home.id, content)).json();
  assert.equal(first.rows[1].duplicate, 'batch');
  const base = {
    text: content,
    requestId: randomUUID(),
    selected: [0, 1],
    categoryChoices: { 'home cooking': 'create' },
    stateHash: first.stateHash,
  };
  assert.equal((await commit(user, home.id, { ...base, keepDuplicates: [] })).status, 409);
  const kept = await commit(user, home.id, {
    ...base,
    requestId: randomUUID(),
    keepDuplicates: [1],
  });
  assert.equal(kept.status, 200, await kept.clone().text());
  assert.equal(
    (await (await preview(user, home.id, text(dish('Same')))).json()).rows[0].duplicate,
    'existing',
  );
  assert.equal(
    (
      await commit(user, home.id, {
        ...base,
        requestId: randomUUID(),
        selected: [0],
        keepDuplicates: [],
      })
    ).status,
    409,
  );
});

test('limits and household isolation apply to preview and commit', async () => {
  const owner = await signIn(identity('Owner A'));
  const home = await createHousehold(owner);
  const other = await signIn(identity('Owner B'));
  const otherHome = await createHousehold(other);
  const content = text(dish('Private'));
  assert.equal((await preview(other, home.id, content)).status, 404);
  assert.equal(
    (
      await commit(other, home.id, {
        text: content,
        requestId: randomUUID(),
        selected: [0],
        categoryChoices: { 'home cooking': 'create' },
        stateHash: 'x',
      })
    ).status,
    404,
  );
  assert.equal((await preview(other, otherHome.id, content)).status, 200);
  assert.equal(
    (
      await preview(
        owner,
        home.id,
        text(...Array.from({ length: 51 }, (_, i) => dish(`Dish ${i}`))),
      )
    ).status,
    400,
  );
  const tooLarge = text({ ...dish('Large'), description: 'x'.repeat(530000) });
  assert.equal((await preview(owner, home.id, tooLarge)).status, 413);
  const noCsrf = await api(owner, `${route(home.id)}/preview`, {
    method: 'POST',
    csrf: false,
    body: { text: content },
  });
  assert.equal(noCsrf.status, 403);
});

test('a full batch cannot race a manual create past household capacity', async () => {
  const user = await signIn(identity('Capacity tester'));
  const home = await createHousehold(user);
  await pool.query(
    `insert into app.recipes
    (household_id, name, description, servings, price_points, steps, source, create_request_id, created_by, updated_by)
    select $1, 'Existing ' || n, '', 1, 0, '{}', 'manual', gen_random_uuid(), $2, $2
    from generate_series(1, 498) n`,
    [home.id, user.id],
  );
  const content = text(dish('Batch 1', null), dish('Batch 2', null));
  const check = await (await preview(user, home.id, content)).json();
  assert.equal(check.remainingRecipes, 2);
  const batch = {
    text: content,
    requestId: randomUUID(),
    selected: [0, 1],
    keepDuplicates: [],
    categoryChoices: {},
    stateHash: check.stateHash,
  };
  const [imported, manual] = await Promise.all([
    commit(user, home.id, batch),
    api(user, `/households/${home.id}/recipes`, {
      method: 'POST',
      body: { requestId: randomUUID(), name: 'Manual 500', servings: 1 },
    }),
  ]);
  assert.ok(
    (imported.status === 200 && manual.status === 409) ||
      (imported.status === 409 && manual.status === 201),
    `one capacity-changing write succeeds: import ${imported.status}, manual ${manual.status}`,
  );
  const finalCount = (
    await pool.query('select count(*)::int as n from app.recipes where household_id=$1', [home.id])
  ).rows[0].n;
  assert.ok(finalCount <= 500);
  assert.ok(finalCount >= 499);
});

test('category changes after preview conflict without creating recipes or empty categories', async () => {
  const user = await signIn(identity('Category reviewer'));
  const home = await createHousehold(user);
  const category = await api(user, `/households/${home.id}/categories`, {
    method: 'POST',
    body: { name: 'Mains' },
  });
  const existing = await category.json();
  const content = text(dish('Rice', 'Mains'), dish('Soup', 'Soups'));
  const check = await (await preview(user, home.id, content)).json();
  const renamed = await api(user, `/households/${home.id}/categories/${existing.id}`, {
    method: 'PUT',
    body: { name: 'Main dishes' },
  });
  assert.equal(renamed.status, 200);
  const saved = await commit(user, home.id, {
    text: content,
    requestId: randomUUID(),
    selected: [0, 1],
    keepDuplicates: [],
    categoryChoices: { mains: existing.id, soups: 'create' },
    stateHash: check.stateHash,
  });
  assert.equal(saved.status, 409);
  assert.equal(
    (
      await pool.query('select count(*)::int as n from app.recipes where household_id=$1', [
        home.id,
      ])
    ).rows[0].n,
    0,
  );
  assert.deepEqual(
    (
      await pool.query('select name from app.recipe_categories where household_id=$1', [home.id])
    ).rows.map((row) => row.name),
    ['Main dishes'],
  );
});

test('preview requests have a per-household rate limit with a retry hint', async () => {
  const user = await signIn(identity('Rate tester'));
  const home = await createHousehold(user);
  const content = text(dish('Rate dish', null));
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await preview(user, home.id, content);
    assert.equal(response.status, 200, `preview ${attempt + 1}`);
  }
  const limited = await preview(user, home.id, content);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
});

test('a maximum batch saves all 50 structured recipes', async () => {
  const user = await signIn(identity('Batch tester'));
  const home = await createHousehold(user);
  const content = text(...Array.from({ length: 50 }, (_, index) => dish(`Dish ${index}`, null)));
  const check = await (await preview(user, home.id, content)).json();
  assert.equal(check.rows.length, 50);
  const response = await commit(user, home.id, {
    text: content,
    requestId: randomUUID(),
    selected: check.rows.map((row) => row.index),
    keepDuplicates: [],
    categoryChoices: {},
    stateHash: check.stateHash,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).imported, 50);
  assert.equal(
    (
      await pool.query(
        'select count(*)::int as n from app.recipe_ingredients where household_id=$1',
        [home.id],
      )
    ).rows[0].n,
    100,
  );
});
