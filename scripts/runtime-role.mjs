import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Restricted runtime database login (REL-001, ADR 0010). Migrations run with an owner login; the
 * application connects as this role, which can read and write rows in `app` but cannot change the
 * schema, and can only append to the audit trail. Safe to run repeatedly, e.g. after every
 * migration: it (re)applies the grants and changes the password only when one is given.
 */
export async function applyRuntimeRole({ databaseUrl, role, password }) {
  if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL (or DATABASE_URL) is required.');
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(role))
    throw new Error('RUNTIME_DB_ROLE is not a safe role name.');
  if (password !== undefined && password.length < 24) {
    throw new Error('RUNTIME_DB_PASSWORD must be at least 24 characters.');
  }
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('begin');
    const exists = await client.query('select 1 from pg_roles where rolname = $1', [role]);
    const id = client.escapeIdentifier(role);
    if (exists.rowCount === 0) {
      if (password === undefined)
        throw new Error('RUNTIME_DB_PASSWORD is required to create the role.');
      await client.query(
        `create role ${id} login nosuperuser nocreatedb nocreaterole noinherit password ${client.escapeLiteral(password)}`,
      );
    } else if (password !== undefined) {
      await client.query(`alter role ${id} with login password ${client.escapeLiteral(password)}`);
    }
    // The migration owner keeps the schema; the runtime role works with rows only.
    await client.query(`revoke create on schema app from ${id}`);
    await client.query(`grant usage on schema app to ${id}`);
    await client.query(`grant select, insert, update, delete on all tables in schema app to ${id}`);
    await client.query(`grant usage, select on all sequences in schema app to ${id}`);
    await client.query(`revoke update, delete, truncate on app.audit_events from ${id}`);
    // Tables and sequences created by later migrations (run as this owner) get the same rights;
    // an append-only table added later must revoke them again here.
    await client.query(
      `alter default privileges in schema app grant select, insert, update, delete on tables to ${id}`,
    );
    await client.query(
      `alter default privileges in schema app grant usage, select on sequences to ${id}`,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await applyRuntimeRole({
      databaseUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
      role: process.env.RUNTIME_DB_ROLE ?? 'family_menu_app',
      password: process.env.RUNTIME_DB_PASSWORD || undefined,
    });
    console.log('Runtime database role is up to date.');
  } catch (error) {
    // Messages above never contain the password or connection string.
    console.error(
      `Runtime role setup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    process.exitCode = 1;
  }
}
