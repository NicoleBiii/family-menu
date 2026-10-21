import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { applyBackupRole, applyRuntimeRole } from '../../scripts/runtime-role.mjs';
import {
  api,
  databaseUrl,
  identity,
  pool,
  RUNTIME_ROLE,
  runtimeDatabaseUrl,
  signIn,
} from './harness.mjs';

// REL-001 / ADR 0010: the application's database login works with rows only. It cannot change
// the schema or rewrite the audit trail; every other integration test already runs the API as it.

test('the runtime role reads and writes rows but cannot change schema or audit history', async () => {
  const privileges = await pool.query(
    `select has_schema_privilege($1, 'app', 'CREATE') as create_in_app,
            has_table_privilege($1, 'app.recipes', 'SELECT, INSERT, UPDATE, DELETE') as recipes_rw,
            has_table_privilege($1, 'app.audit_events', 'INSERT') as audit_insert,
            has_table_privilege($1, 'app.audit_events', 'UPDATE') as audit_update,
            has_table_privilege($1, 'app.audit_events', 'DELETE') as audit_delete,
            r.rolsuper, r.rolcreaterole, r.rolcreatedb
       from pg_roles r where r.rolname = $1`,
    [RUNTIME_ROLE],
  );
  assert.deepEqual(privileges.rows[0], {
    create_in_app: false,
    recipes_rw: true,
    audit_insert: true,
    audit_update: false,
    audit_delete: false,
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
  });

  // A request through the API writes audit rows as this role.
  const user = await signIn(identity('Runtime role'));
  const home = await api(user, '/households', { method: 'POST', body: { name: 'Runtime home' } });
  assert.equal(home.status, 201);

  const runtime = new pg.Client({ connectionString: runtimeDatabaseUrl });
  await runtime.connect();
  try {
    for (const statement of [
      'create table app.not_allowed (id int)',
      'alter table app.recipes add column not_allowed int',
      'drop table app.recipes',
      'update app.audit_events set action = action',
      'delete from app.audit_events',
      'truncate app.households cascade',
    ]) {
      await assert.rejects(runtime.query(statement), (error) => error.code === '42501', statement);
    }
    const count = await runtime.query('select count(*)::int as n from app.households');
    assert.ok(count.rows[0].n >= 1);
  } finally {
    await runtime.end();
  }
});

test('the role script is repeatable, keeps the password unless given and rejects unsafe input', async () => {
  await applyRuntimeRole({ databaseUrl, role: RUNTIME_ROLE });
  const runtime = new pg.Client({ connectionString: runtimeDatabaseUrl });
  await runtime.connect();
  await runtime.end();
  await assert.rejects(
    applyRuntimeRole({ databaseUrl, role: 'Bad-Name; drop', password: 'x'.repeat(30) }),
    /safe role name/,
  );
  await assert.rejects(
    applyRuntimeRole({ databaseUrl, role: RUNTIME_ROLE, password: 'short' }),
    /at least 24/,
  );
  await assert.rejects(
    applyRuntimeRole({ databaseUrl, role: 'family_menu_missing_role' }),
    /required to create/,
  );
});

// ADR 0011: the scheduled backup's stored login can read household data but never write it.
test('the backup role is created only with a password and can read but not write', async () => {
  assert.equal(await applyBackupRole({ databaseUrl, role: 'family_menu_missing_backup' }), false);
  await assert.rejects(
    applyBackupRole({ databaseUrl, role: 'family_menu_backup_test', password: 'short' }),
    /at least 24/,
  );
  const password = 'backup-test-only-not-a-real-secret';
  const role = 'family_menu_backup_test';
  assert.equal(await applyBackupRole({ databaseUrl, role, password }), true);
  assert.equal(await applyBackupRole({ databaseUrl, role }), true);
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  const backup = new pg.Client({ connectionString: url.href });
  await backup.connect();
  try {
    const migrations = await backup.query('select count(*)::int as n from public.kysely_migration');
    assert.ok(migrations.rows[0].n >= 10);
    await backup.query('select count(*) from app.recipe_images');
    await assert.rejects(
      backup.query('delete from app.recipes'),
      (error) => error.code === '25006',
    );
    await backup.query('begin read write');
    for (const statement of [
      'delete from app.recipes',
      "insert into app.households (name) values ('x')",
      'create table app.not_allowed (id int)',
    ]) {
      await backup.query('savepoint attempt');
      await assert.rejects(backup.query(statement), (error) => error.code === '42501', statement);
      await backup.query('rollback to savepoint attempt');
    }
    await backup.query('rollback');
  } finally {
    await backup.end();
  }
});
