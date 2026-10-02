import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, createHousehold, identity, invite, pool, signIn } from './harness.mjs';

// UX-002 phase 2 (ADR 0007): household recipe categories. One optional category per recipe,
// shared management by every member, deletion only with an explicit destination, household
// isolation (AC-02) and untouched order snapshots (AC-11).

async function joinedHousehold(name = 'Category home') {
  const owner = await signIn(identity('Owner'));
  const household = await createHousehold(owner, name);
  const member = await signIn(identity('Member'));
  const link = await invite(owner, household.id);
  const joined = await api(member, '/invitations/accept', {
    method: 'POST',
    body: { token: link.token },
  });
  assert.equal(joined.status, 200);
  return { owner, member, household };
}

async function category(user, householdId, name) {
  const response = await api(user, `/households/${householdId}/categories`, {
    method: 'POST',
    body: { name },
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function categories(user, householdId) {
  const response = await api(user, `/households/${householdId}/categories`);
  assert.equal(response.status, 200);
  return response.json();
}

function recipeBody(overrides = {}) {
  return {
    requestId: randomUUID(),
    name: 'Weeknight soup',
    servings: 2,
    pricePoints: 2,
    steps: ['Simmer.'],
    ingredients: [{ name: 'Carrot', quantity: '2' }],
    ...overrides,
  };
}

async function saveRecipe(user, householdId, overrides) {
  const response = await api(user, `/households/${householdId}/recipes`, {
    method: 'POST',
    body: recipeBody(overrides),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function update(user, householdId, recipe, changes) {
  const { id, revision, name, description, servings, pricePoints, steps, ingredients } = recipe;
  return api(user, `/households/${householdId}/recipes/${id}`, {
    method: 'PUT',
    body: {
      expectedRevision: revision,
      name,
      description,
      servings,
      pricePoints,
      steps,
      ingredients,
      ...changes,
    },
  });
}

function remove(user, householdId, categoryId, body) {
  return api(user, `/households/${householdId}/categories/${categoryId}/delete`, {
    method: 'POST',
    body,
  });
}

test('members share categories; names are unique per household and creation is idempotent', async () => {
  const { owner, member, household } = await joinedHousehold();
  const soups = await category(owner, household.id, '  Soups  ');
  assert.equal(soups.name, 'Soups');
  assert.equal(soups.recipeCount, 0);

  const again = await category(member, household.id, 'ｓｏｕｐｓ');
  assert.equal(again.id, soups.id, 'the same name, by any member, returns the existing category');
  const concurrent = await Promise.all(
    [1, 2, 3].map(() => category(member, household.id, '家常菜')),
  );
  assert.equal(new Set(concurrent.map((row) => row.id)).size, 1);

  const breakfast = await category(member, household.id, 'Breakfast');
  assert.deepEqual(
    (await categories(owner, household.id)).map((row) => row.name),
    ['Breakfast', 'Soups', '家常菜'],
  );

  const recipe = await saveRecipe(member, household.id, { categoryId: soups.id });
  assert.equal(recipe.categoryId, soups.id);

  // Any member renames; links are by id, so the recipe keeps its category.
  const renamed = await api(owner, `/households/${household.id}/categories/${soups.id}`, {
    method: 'PUT',
    body: { name: 'Soups & stews' },
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(await renamed.json(), {
    id: soups.id,
    name: 'Soups & stews',
    recipeCount: 1,
    archivedCount: 0,
  });
  const reread = await (
    await api(owner, `/households/${household.id}/recipes/${recipe.id}`)
  ).json();
  assert.equal(reread.categoryId, soups.id);

  const clash = await api(member, `/households/${household.id}/categories/${breakfast.id}`, {
    method: 'PUT',
    body: { name: 'soups & STEWS' },
  });
  assert.equal(clash.status, 409);
  const sameName = await api(member, `/households/${household.id}/categories/${soups.id}`, {
    method: 'PUT',
    body: { name: 'soups & stews' },
  });
  assert.equal(sameName.status, 200, 'changing only the letter case of its own name is allowed');

  for (const name of ['', '   ', 'x'.repeat(41), 42]) {
    const invalid = await api(owner, `/households/${household.id}/categories`, {
      method: 'POST',
      body: { name },
    });
    assert.equal(invalid.status, 400, `name ${JSON.stringify(name)} is rejected`);
  }
  const noCsrf = await api(owner, `/households/${household.id}/categories`, {
    method: 'POST',
    csrf: false,
    body: { name: 'Snacks' },
  });
  assert.equal(noCsrf.status, 403);
});

test('a recipe has one optional category: omitted on update keeps it, null clears it', async () => {
  const { owner, household } = await joinedHousehold();
  const plain = await saveRecipe(owner, household.id);
  assert.equal(plain.categoryId, null, 'a recipe without a category is Uncategorised');
  const listed = await (await api(owner, `/households/${household.id}/recipes`)).json();
  assert.equal(listed[0].categoryId, null);

  const mains = await category(owner, household.id, 'Mains');
  const sides = await category(owner, household.id, 'Sides');
  const recipe = await saveRecipe(owner, household.id, { categoryId: mains.id.toUpperCase() });
  assert.equal(recipe.categoryId, mains.id);

  const kept = await update(owner, household.id, recipe, { name: 'Renamed soup' });
  assert.equal(kept.status, 200);
  const keptBody = await kept.json();
  assert.equal(keptBody.categoryId, mains.id, 'an update without categoryId keeps the category');

  const moved = await update(owner, household.id, keptBody, { categoryId: sides.id });
  const movedBody = await moved.json();
  assert.equal(movedBody.categoryId, sides.id);
  const cleared = await update(owner, household.id, movedBody, { categoryId: null });
  assert.equal((await cleared.json()).categoryId, null);

  for (const categoryId of ['not-a-uuid', 7, randomUUID()]) {
    const invalid = await api(owner, `/households/${household.id}/recipes`, {
      method: 'POST',
      body: recipeBody({ categoryId }),
    });
    assert.equal(invalid.status, 400, `categoryId ${categoryId} is rejected`);
  }
});

test('AC-02: categories and their ids stay inside the household', async () => {
  const { owner, household } = await joinedHousehold('Home A');
  const other = await signIn(identity('Other owner'));
  const otherHome = await createHousehold(other, 'Home B');
  const mine = await category(owner, household.id, 'Private category');
  const theirs = await category(other, otherHome.id, 'Their category');

  const base = `/households/${household.id}/categories`;
  assert.equal((await api(other, base)).status, 404);
  assert.equal(
    (await api(other, base, { method: 'POST', body: { name: 'Intruder' } })).status,
    404,
  );
  assert.equal(
    (await api(other, `${base}/${mine.id}`, { method: 'PUT', body: { name: 'Taken' } })).status,
    404,
  );
  assert.equal((await remove(other, household.id, mine.id, { moveTo: null })).status, 404);
  // A household's own route cannot reach another household's category either.
  assert.equal(
    (
      await api(other, `/households/${otherHome.id}/categories/${mine.id}`, {
        method: 'PUT',
        body: { name: 'Taken' },
      })
    ).status,
    404,
  );
  assert.equal((await remove(other, otherHome.id, mine.id, { moveTo: null })).status, 404);

  const crossCreate = await api(owner, `/households/${household.id}/recipes`, {
    method: 'POST',
    body: recipeBody({ categoryId: theirs.id }),
  });
  assert.equal(crossCreate.status, 400, 'another household’s category id cannot be used');
  const recipe = await saveRecipe(owner, household.id, { categoryId: mine.id });
  const crossUpdate = await update(owner, household.id, recipe, { categoryId: theirs.id });
  assert.equal(crossUpdate.status, 400);
  const crossMove = await remove(owner, household.id, mine.id, { moveTo: theirs.id });
  assert.equal(crossMove.status, 400, 'recipes cannot be moved to another household’s category');

  assert.deepEqual(
    (await categories(owner, household.id)).map((row) => row.name),
    ['Private category'],
  );
  const stored = await pool.query('select name from app.recipe_categories where id = $1', [
    mine.id,
  ]);
  assert.equal(stored.rows[0].name, 'Private category');
});

test('deleting a category moves its recipes to the chosen destination with new revisions', async () => {
  const { owner, member, household } = await joinedHousehold();
  const soups = await category(owner, household.id, 'Soups');
  const stews = await category(owner, household.id, 'Stews');
  const first = await saveRecipe(owner, household.id, {
    name: 'Lentil soup',
    categoryId: soups.id,
  });
  const second = await saveRecipe(owner, household.id, { name: 'Miso soup', categoryId: soups.id });
  const archive = await api(owner, `/households/${household.id}/recipes/${second.id}/archive`, {
    method: 'POST',
    body: { expectedRevision: second.revision },
  });
  assert.equal(archive.status, 200);
  const archived = await archive.json();
  const listed = await categories(owner, household.id);
  assert.deepEqual(
    listed.map((row) => [row.name, row.recipeCount, row.archivedCount]),
    [
      ['Soups', 1, 1],
      ['Stews', 0, 0],
    ],
  );

  // An order placed before the change keeps its snapshot exactly.
  const ordered = await api(member, `/households/${household.id}/orders`, {
    method: 'POST',
    body: {
      requestId: randomUUID(),
      when: { type: 'now' },
      items: [{ recipeId: first.id, servings: 2 }],
    },
  });
  assert.equal(ordered.status, 201);
  const order = await ordered.json();

  assert.equal((await remove(member, household.id, soups.id, {})).status, 400, 'moveTo required');
  assert.equal(
    (await remove(member, household.id, soups.id, { moveTo: soups.id })).status,
    400,
    'a category cannot receive its own recipes',
  );
  assert.equal(
    (await remove(member, household.id, soups.id, { moveTo: randomUUID() })).status,
    400,
  );

  const deleted = await remove(member, household.id, soups.id, { moveTo: stews.id });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { moved: 2, moveTo: stews.id });
  assert.deepEqual(
    (await categories(owner, household.id)).map((row) => [row.name, row.recipeCount]),
    [['Stews', 1]],
  );
  const movedFirst = await (
    await api(owner, `/households/${household.id}/recipes/${first.id}`)
  ).json();
  assert.equal(movedFirst.categoryId, stews.id);
  assert.equal(movedFirst.revision, first.revision + 1);
  assert.equal(movedFirst.updatedBy, 'Member');
  const movedArchived = await (
    await api(owner, `/households/${household.id}/recipes/${second.id}`)
  ).json();
  assert.equal(movedArchived.categoryId, stews.id, 'archived recipes move too');
  assert.equal(movedArchived.revision, archived.revision + 1);

  // An editor still holding the old revision gets a conflict instead of overwriting the move,
  // and the deleted category can no longer be chosen.
  const stale = await update(owner, household.id, first, { name: 'Stale edit' });
  assert.equal(stale.status, 409);
  const gone = await update(owner, household.id, movedFirst, { categoryId: soups.id });
  assert.equal(gone.status, 400);

  const afterOrder = await (
    await api(owner, `/households/${household.id}/orders/${order.id}`)
  ).json();
  assert.deepEqual(afterOrder.items, order.items, 'order snapshots are unchanged');

  // Deleting to Uncategorised clears the category.
  const cleared = await remove(owner, household.id, stews.id, { moveTo: null });
  assert.deepEqual(await cleared.json(), { moved: 2, moveTo: null });
  const final = await (await api(owner, `/households/${household.id}/recipes`)).json();
  assert.deepEqual(
    final.map((row) => row.categoryId),
    [null, null],
  );
  assert.equal((await remove(owner, household.id, stews.id, { moveTo: null })).status, 404);
});

test('a household keeps at most 30 categories', async () => {
  const user = await signIn(identity('Organiser'));
  const household = await createHousehold(user, 'Tidy home');
  await pool.query(
    `insert into app.recipe_categories (household_id, name, name_key, created_by, updated_by)
     select $1, 'Category ' || n, 'category ' || n, m.user_id, m.user_id
     from generate_series(1, 30) n, app.household_members m where m.household_id = $1`,
    [household.id],
  );
  const full = await api(user, `/households/${household.id}/categories`, {
    method: 'POST',
    body: { name: 'One more' },
  });
  assert.equal(full.status, 409);
  const existing = await api(user, `/households/${household.id}/categories`, {
    method: 'POST',
    body: { name: 'category 7' },
  });
  assert.equal(existing.status, 201, 'an existing name is still returned at the limit');
});
