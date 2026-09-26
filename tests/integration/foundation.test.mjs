import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { migrate } from '../../scripts/migrate.mjs';
import { createApplication } from '../../apps/api/dist/app.js';
import { readConfig } from '../../apps/api/dist/config.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('TEST_DATABASE_URL is required; integration tests must not silently skip.');
const parsed = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  parsed.pathname !== '/family_menu_test'
) {
  throw new Error('Tests require the dedicated loopback family_menu_test database.');
}
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
let app;
let origin;

before(async () => {
  await migrate(databaseUrl);
  ({ app } = await createApplication({ databaseUrl, port: 3000, host: '127.0.0.1' }, true));
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
  await pool.end();
});

test('migrations are repeatable without reapplying completed changes', async () => {
  assert.deepEqual(await migrate(databaseUrl), []);
});

test('database constraints reject duplicate membership, invalid roles and missing parents', async () => {
  const client = await pool.connect();
  const userId = randomUUID();
  const householdId = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query('insert into app.user_profiles (id, display_name) values ($1, $2)', [
      userId,
      'Test member',
    ]);
    await client.query('insert into app.households (id, name) values ($1, $2)', [
      householdId,
      'Test household',
    ]);
    await client.query(
      "insert into app.household_members (household_id, user_id, role) values ($1, $2, 'owner')",
      [householdId, userId],
    );
    const cases = [
      [householdId, userId, 'member', '23505'],
      [householdId, userId, 'administrator', '23514'],
      [randomUUID(), userId, 'member', '23503'],
    ];
    for (const [household, user, role, code] of cases) {
      await client.query('SAVEPOINT negative_case');
      await assert.rejects(
        client.query(
          'insert into app.household_members (household_id, user_id, role) values ($1, $2, $3)',
          [household, user, role],
        ),
        { code },
      );
      await client.query('ROLLBACK TO SAVEPOINT negative_case');
    }
    assert.equal(
      (
        await client.query(
          'select count(*)::int as count from app.household_members where household_id=$1',
          [householdId],
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('liveness, database readiness and OpenAPI return actual HTTP responses', async () => {
  const live = await fetch(`${origin}/api/health/live`);
  assert.equal(live.status, 200);
  assert.match(live.headers.get('x-request-id'), /^[a-f0-9-]{36}$/);
  assert.equal((await live.json()).status, 'ok');
  assert.equal((await fetch(`${origin}/api/health/ready`)).status, 200);
  const contract = await (await fetch(`${origin}/api/openapi.json`)).json();
  assert.ok(contract.paths['/api/health/ready']);
  assert.equal(
    (await fetch(`${origin}/api/not-a-route`, { headers: { Accept: 'text/html' } })).status,
    404,
  );
});

test('database failure returns a redacted 503 while liveness stays available', async () => {
  const invalid = new URL(databaseUrl);
  invalid.pathname = '/family_menu_missing_for_readiness_test';
  const { app: unavailable } = await createApplication(
    { databaseUrl: invalid.href, port: 3000, host: '127.0.0.1' },
    true,
  );
  try {
    await unavailable.listen(0, '127.0.0.1');
    const url = await unavailable.getUrl();
    const response = await fetch(`${url}/api/health/ready`);
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.ok(!body.includes(invalid.pathname.slice(1)));
    assert.ok(!body.includes('local-development-only'));
    assert.equal((await fetch(`${url}/api/health/live`)).status, 200);
  } finally {
    await unavailable.close();
  }
});

test('invalid configuration fails without leaking connection secrets', () => {
  assert.throws(() => readConfig({ DATABASE_URL: 'https://invalid' }), /PostgreSQL protocol/);
  assert.throws(() => readConfig({ DATABASE_URL: databaseUrl, PORT: 'NaN' }), /PORT/);
  assert.throws(() => readConfig({}), /DATABASE_URL/);
});
