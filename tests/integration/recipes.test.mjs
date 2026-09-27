import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { api, createHousehold, identity, invite, pool, server, signIn } from './harness.mjs';

// REC-001: manual and preset recipes (AC-05), household isolation for recipes (AC-02), shared
// editing with stale-revision conflicts, idempotent saves, and archive/restore.

function recipe(overrides = {}) {
  return {
    requestId: randomUUID(),
    name: 'Weeknight rice',
    description: 'Plain and dependable.',
    servings: 2,
    pricePoints: 3,
    steps: ['Rinse the rice.', 'Cook with water.'],
    ingredients: [
      { name: 'Jasmine rice', quantity: '200', unit: 'g', form: 'uncooked' },
      { name: 'Salt', note: 'to taste' },
    ],
    ...overrides,
  };
}

async function save(user, householdId, body = recipe()) {
  const response = await api(user, `/households/${householdId}/recipes`, { method: 'POST', body });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

async function joinedHousehold(names = ['Owner', 'Member']) {
  const owner = await signIn(identity(names[0]));
  const household = await createHousehold(owner, 'Recipe home');
  const member = await signIn(identity(names[1]));
  const link = await invite(owner, household.id);
  const joined = await api(member, '/invitations/accept', {
    method: 'POST',
    body: { token: link.token },
  });
  assert.equal(joined.status, 200);
  return { owner, member, household };
}

test('presets are public, read-only starter data that pass the same validation as saved recipes', async () => {
  const response = await fetch(`${server.origin}/api/recipe-presets`);
  assert.equal(response.status, 200);
  const presets = await response.json();
  assert.ok(presets.length >= 10, 'a small curated library exists');
  assert.equal(new Set(presets.map((preset) => preset.id)).size, presets.length);
  const user = await signIn();
  const household = await createHousehold(user);
  for (const preset of presets) {
    assert.ok(!('pricePoints' in preset), 'presets leave the virtual price to the household');
    const saved = await save(user, household.id, {
      requestId: randomUUID(),
      presetId: preset.id,
      name: preset.name,
      description: preset.description,
      servings: preset.servings,
      steps: preset.steps,
      ingredients: preset.ingredients,
    });
    assert.equal(saved.source, 'preset');
    assert.equal(saved.presetId, preset.id);
    assert.equal(saved.presetVersion, preset.version);
    assert.equal(saved.pricePoints, 0);
    assert.deepEqual(saved.ingredients, preset.ingredients);
  }
});

test('AC-05: a manual recipe is saved with exact quantities, Unicode text and unquantified lines', async () => {
  const user = await signIn(identity('Cook'));
  const household = await createHousehold(user);
  const saved = await save(
    user,
    household.id,
    recipe({
      name: '  红烧肉 Braised pork  ',
      servings: 4,
      ingredients: [
        { name: 'Pork belly', quantity: '0.50', unit: 'kg', form: 'cubed' },
        { name: 'Rock sugar', quantity: 0.2, unit: 'cup' },
        { name: 'Star anise', quantity: 2, unit: null },
        { name: '  Soy   Sauce ', quantity: '', unit: '', note: ' to taste ' },
      ],
    }),
  );
  assert.equal(saved.name, '红烧肉 Braised pork');
  assert.equal(saved.revision, 1);
  assert.equal(saved.source, 'manual');
  assert.equal(saved.presetId, null);
  assert.equal(saved.archived, false);
  assert.equal(saved.createdBy, 'Cook');
  assert.deepEqual(saved.ingredients, [
    { name: 'Pork belly', quantity: '0.5', unit: 'kg', form: 'cubed', note: null },
    { name: 'Rock sugar', quantity: '0.2', unit: 'cup', form: null, note: null },
    { name: 'Star anise', quantity: '2', unit: null, form: null, note: null },
    { name: 'Soy   Sauce', quantity: null, unit: null, form: null, note: 'to taste' },
  ]);
  const keys = await pool.query(
    'select ingredient_key from app.recipe_ingredients where recipe_id=$1 order by position',
    [saved.id],
  );
  assert.equal(keys.rows[3].ingredient_key, 'soy sauce', 'identity is normalized for grouping');

  const fetched = await (await api(user, `/households/${household.id}/recipes/${saved.id}`)).json();
  assert.deepEqual(fetched, saved);
  const listed = await (await api(user, `/households/${household.id}/recipes`)).json();
  assert.deepEqual(
    listed.map((row) => [row.id, row.ingredientCount, row.archived, row.pricePoints]),
    [[saved.id, 4, false, 3]],
  );
});

test('AC-05: a preset copy is edited and saved while the preset source stays unchanged', async () => {
  const before = await (await fetch(`${server.origin}/api/recipe-presets`)).json();
  const preset = before.find((item) => item.id === 'tomato-egg-stir-fry');
  assert.ok(preset);
  const user = await signIn();
  const household = await createHousehold(user);
  const saved = await save(user, household.id, {
    requestId: randomUUID(),
    presetId: preset.id,
    name: `${preset.name} (extra eggs)`,
    description: preset.description,
    servings: 3,
    pricePoints: 5,
    steps: preset.steps,
    ingredients: [{ ...preset.ingredients[0], quantity: '5' }, ...preset.ingredients.slice(1)],
  });
  const edited = await api(user, `/households/${household.id}/recipes/${saved.id}`, {
    method: 'PUT',
    body: {
      expectedRevision: 1,
      name: 'Our tomato eggs',
      servings: 3,
      pricePoints: 6,
      steps: ['Our own method.'],
      ingredients: [{ name: 'egg', quantity: '6' }],
    },
  });
  assert.equal(edited.status, 200);
  const body = await edited.json();
  assert.equal(body.revision, 2);
  assert.equal(body.presetId, preset.id, 'provenance survives edits');
  assert.deepEqual(body.steps, ['Our own method.']);
  const after = await (await fetch(`${server.origin}/api/recipe-presets`)).json();
  assert.deepEqual(after, before);
});

test('invalid recipes are rejected with 400 and create nothing', async () => {
  const user = await signIn();
  const household = await createHousehold(user);
  const cases = [
    { name: '' },
    { name: 'x'.repeat(121) },
    { servings: 0 },
    { servings: 2.5 },
    { servings: '2' },
    { pricePoints: -1 },
    { pricePoints: 10000 },
    { steps: 'not a list' },
    { steps: [''] },
    { steps: Array.from({ length: 31 }, () => 'step') },
    { ingredients: Array.from({ length: 61 }, () => ({ name: 'salt' })) },
    { ingredients: [{ name: '' }] },
    { ingredients: [{ name: 'rice', quantity: '0' }] },
    { ingredients: [{ name: 'rice', quantity: '-1' }] },
    { ingredients: [{ name: 'rice', quantity: '1.2345' }] },
    { ingredients: [{ name: 'rice', quantity: 0.1 + 0.2 }] },
    { ingredients: [{ name: 'rice', quantity: '1e3' }] },
    { ingredients: [{ name: 'rice', quantity: '100001' }] },
    { ingredients: [{ name: 'rice', quantity: '1', unit: 'handful' }] },
    { ingredients: [{ name: 'rice', unit: 'g' }] },
    { ingredients: [{ name: 'rice', form: 'x'.repeat(61) }] },
    { presetId: 'no-such-preset' },
    { requestId: 'not-a-uuid' },
    { requestId: undefined },
  ];
  for (const overrides of cases) {
    const response = await api(user, `/households/${household.id}/recipes`, {
      method: 'POST',
      body: recipe(overrides),
    });
    assert.equal(response.status, 400, JSON.stringify(overrides));
  }
  const count = await pool.query(
    'select count(*)::int as count from app.recipes where household_id=$1',
    [household.id],
  );
  assert.equal(count.rows[0].count, 0);
});

test('a retried save with the same requestId creates exactly one recipe, even concurrently', async () => {
  const user = await signIn();
  const household = await createHousehold(user);
  const body = recipe();
  const first = await save(user, household.id, body);
  const retry = await save(user, household.id, { ...body, name: 'Changed on retry' });
  assert.equal(retry.id, first.id);
  assert.equal(retry.name, first.name, 'a replay returns the original save');

  const racing = recipe();
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      api(user, `/households/${household.id}/recipes`, { method: 'POST', body: racing }),
    ),
  );
  assert.deepEqual(
    results.map((response) => response.status),
    [201, 201, 201],
  );
  const ids = await Promise.all(results.map(async (response) => (await response.json()).id));
  assert.equal(new Set(ids).size, 1);
  const count = await pool.query(
    'select count(*)::int as count from app.recipes where household_id=$1',
    [household.id],
  );
  assert.equal(count.rows[0].count, 2);
});

test('every member edits the shared menu; a stale revision gets a conflict instead of overwriting', async () => {
  const { owner, member, household } = await joinedHousehold();
  const saved = await save(owner, household.id);
  const path = `/households/${household.id}/recipes/${saved.id}`;
  const edit = (user, name, expectedRevision = 1) =>
    api(user, path, {
      method: 'PUT',
      body: { expectedRevision, name, servings: 2, ingredients: [] },
    });

  const [a, b] = await Promise.all([edit(owner, 'Owner version'), edit(member, 'Member version')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? 'Owner version' : 'Member version';
  const loser = a.status === 409 ? a : b;
  assert.match((await loser.json()).message, /Someone else changed this recipe/);
  const current = await (await api(member, path)).json();
  assert.equal(current.name, winner);
  assert.equal(current.revision, 2);

  const stale = await edit(owner, 'Late edit', 1);
  assert.equal(stale.status, 409);
  const fresh = await edit(member, 'Member edits owner recipe', 2);
  assert.equal(fresh.status, 200);
  const body = await fresh.json();
  assert.equal(body.updatedBy, 'Member');
  assert.equal(body.createdBy, 'Owner');
  assert.deepEqual(body.ingredients, []);
  assert.equal(
    (await api(owner, path, { method: 'PUT', body: { name: 'No revision', servings: 1 } })).status,
    400,
  );
});

test('archiving hides nothing destructively and blocks edits until restored', async () => {
  const user = await signIn();
  const household = await createHousehold(user);
  const saved = await save(user, household.id);
  const path = `/households/${household.id}/recipes/${saved.id}`;

  assert.equal(
    (await api(user, `${path}/archive`, { method: 'POST', body: { expectedRevision: 9 } })).status,
    409,
  );
  const archived = await api(user, `${path}/archive`, {
    method: 'POST',
    body: { expectedRevision: 1 },
  });
  assert.equal(archived.status, 200);
  assert.deepEqual(
    [(await archived.json()).archived, (await (await api(user, path)).json()).revision],
    [true, 2],
  );
  assert.equal(
    (await api(user, `${path}/archive`, { method: 'POST', body: { expectedRevision: 2 } })).status,
    409,
    'already archived',
  );
  const edit = await api(user, path, {
    method: 'PUT',
    body: { expectedRevision: 2, name: 'Edit while archived', servings: 2 },
  });
  assert.equal(edit.status, 409);
  assert.match((await edit.json()).message, /archived/);
  const listed = await (await api(user, `/households/${household.id}/recipes`)).json();
  assert.equal(listed[0].archived, true);
  assert.equal(listed[0].ingredientCount, 2, 'archived recipes keep their content');

  const restored = await api(user, `${path}/restore`, {
    method: 'POST',
    body: { expectedRevision: 2 },
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).archived, false);
  assert.equal(
    (
      await api(user, path, {
        method: 'PUT',
        body: { expectedRevision: 3, name: 'Editable again', servings: 2 },
      })
    ).status,
    200,
  );
});

test('AC-02: household A cannot list, read, create, edit, archive or restore household B recipes', async () => {
  const alice = await signIn(identity('Alice'));
  const bob = await signIn(identity('Bob'));
  const householdA = await createHousehold(alice, 'A');
  const householdB = await createHousehold(bob, 'B');
  const recipeB = await save(bob, householdB.id, recipe({ name: 'Secret B dish' }));
  const recipeA = await save(alice, householdA.id);
  const update = { expectedRevision: 1, name: 'Hijacked', servings: 1 };

  const attempts = [
    ['GET', `/households/${householdB.id}/recipes`],
    ['POST', `/households/${householdB.id}/recipes`, recipe()],
    ['GET', `/households/${householdB.id}/recipes/${recipeB.id}`],
    ['PUT', `/households/${householdB.id}/recipes/${recipeB.id}`, update],
    ['POST', `/households/${householdB.id}/recipes/${recipeB.id}/archive`, update],
    ['POST', `/households/${householdB.id}/recipes/${recipeB.id}/restore`, update],
    // A valid B recipe id under A's household path is still not found.
    ['GET', `/households/${householdA.id}/recipes/${recipeB.id}`],
    ['PUT', `/households/${householdA.id}/recipes/${recipeB.id}`, update],
    ['POST', `/households/${householdA.id}/recipes/${recipeB.id}/archive`, update],
    ['GET', `/households/${householdA.id}/recipes/not-a-uuid`],
    ['PUT', `/households/${householdA.id}/recipes/${randomUUID()}`, update],
  ];
  for (const [method, path, body] of attempts) {
    const response = await api(alice, path, { method, body });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.ok(!(await response.text()).includes('Secret B dish'));
  }
  const listedA = await (await api(alice, `/households/${householdA.id}/recipes`)).json();
  assert.deepEqual(
    listedA.map((row) => row.id),
    [recipeA.id],
  );
  const stillB = await (
    await api(bob, `/households/${householdB.id}/recipes/${recipeB.id}`)
  ).json();
  assert.deepEqual(stillB, recipeB);
  const countB = await pool.query(
    'select count(*)::int as count from app.recipes where household_id=$1',
    [householdB.id],
  );
  assert.equal(countB.rows[0].count, 1);
});

test('removed members lose recipe access; writes need the CSRF token', async () => {
  const { owner, member, household } = await joinedHousehold();
  const saved = await save(member, household.id);
  const path = `/households/${household.id}/recipes/${saved.id}`;
  assert.equal(
    (
      await api(member, `/households/${household.id}/recipes`, {
        method: 'POST',
        body: recipe(),
        csrf: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(member, path, {
        method: 'PUT',
        body: { expectedRevision: 1, name: 'x', servings: 1 },
        csrf: false,
      })
    ).status,
    403,
  );

  assert.equal(
    (await api(owner, `/households/${household.id}/members/${member.id}`, { method: 'DELETE' }))
      .status,
    204,
  );
  assert.equal((await api(member, path)).status, 404);
  assert.equal(
    (
      await api(member, path, {
        method: 'PUT',
        body: { expectedRevision: 1, name: 'After removal', servings: 1 },
      })
    ).status,
    404,
  );
  assert.equal(
    (await api(member, `/households/${household.id}/recipes`, { method: 'POST', body: recipe() }))
      .status,
    404,
  );
  const kept = await (await api(owner, path)).json();
  assert.equal(kept.name, saved.name, 'recipes a removed member created stay with the household');
  assert.equal(kept.createdBy, 'Member');
});

test('database constraints keep ingredient lines inside their recipe household', async () => {
  const alice = await signIn();
  const bob = await signIn();
  const householdA = await createHousehold(alice);
  const householdB = await createHousehold(bob);
  const recipeA = await save(alice, householdA.id);
  const insert = (householdId, extra = {}) =>
    pool
      .query(
        `insert into app.recipe_ingredients
           (household_id, recipe_id, position, name, ingredient_key, quantity, unit)
         values ($1, $2, $3, 'x', 'x', $4, $5)`,
        [householdId, recipeA.id, extra.position ?? 50, extra.quantity ?? null, extra.unit ?? null],
      )
      .then(
        () => 'ok',
        (error) => error.code,
      );
  assert.equal(await insert(householdB.id), '23503', 'cross-household line rejected');
  assert.equal(await insert(householdA.id, { unit: 'g' }), '23514', 'unit without quantity');
  assert.equal(await insert(householdA.id, { quantity: '1.2345' }), '23514', 'scale limited');
  assert.equal(await insert(householdA.id, { unit: 'handful', quantity: '1' }), '23514');
  assert.equal(
    await pool.query("update app.recipes set source = 'preset' where id=$1", [recipeA.id]).then(
      () => 'ok',
      (error) => error.code,
    ),
    '23514',
    'preset source requires a preset id',
  );
});
