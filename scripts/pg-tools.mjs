import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import pg from 'pg';

/**
 * Shared helpers for the operations scripts (backup, restore drill and check). Connection URLs
 * follow libpq semantics, because the same URL is handed to pg_dump/pg_restore/psql: for example
 * `sslmode=require` encrypts without verifying the certificate, as Railway's proxy needs.
 */
export function client(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.searchParams.has('sslmode')) url.searchParams.set('uselibpqcompat', 'true');
  return new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 10000 });
}

function tool(name) {
  return process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;
}

/** Runs a pg tool against `url`, passing its password by environment, not on the command line. */
export function run(name, args, databaseUrl) {
  const target = new URL(databaseUrl);
  const password = decodeURIComponent(target.password);
  target.password = '';
  target.searchParams.delete('uselibpqcompat');
  const started = Date.now();
  const result = spawnSync(tool(name), [...args, target.href], {
    env: { ...process.env, PGPASSWORD: password },
    encoding: 'utf8',
  });
  if (result.error) throw new Error(`${name} is unavailable; set PG_BIN.`);
  if (result.status !== 0) {
    // pg tools print connection details without passwords; keep the actual error lines.
    const lines = (result.stderr || '').split('\n').filter((line) => /error|fatal/i.test(line));
    throw new Error(`${name} failed: ${lines.slice(0, 2).join(' ') || 'see its output'}`);
  }
  return Date.now() - started;
}

/** The app schema, plus only the migration bookkeeping from `public`. */
export const DUMPS = {
  app: { file: 'app.dump', args: ['--schema=app'] },
  migrations: {
    file: 'migrations.dump',
    args: ['--table=public.kysely_migration', '--table=public.kysely_migration_lock'],
  },
};
export const DUMP_OPTIONS = ['--format=custom', '--no-owner', '--no-acl'];
