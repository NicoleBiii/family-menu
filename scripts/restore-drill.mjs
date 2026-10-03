import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { compare, snapshot } from './restore-check.mjs';

/**
 * Restore drill (REL-001, ADR 0010): dump the source database, restore it into a new, empty
 * database on a separate server, and compare migrations, row counts and photo bytes.
 *
 *   SOURCE_DATABASE_URL  database to back up (read-only use; e.g. production via the pooler)
 *   DRILL_SERVER_URL     an empty-able server for the copy, e.g. a local PostgreSQL of the same
 *                        or newer major version; a database named family_menu_restore_drill is
 *                        created there and dropped afterwards unless KEEP_DRILL_DATABASE=1
 *   PG_BIN               optional directory of pg_dump/pg_restore matching the source version
 *
 * The dump file lives in a private temporary directory and is deleted at the end. Output is
 * counts and timings only; credentials and row contents are never printed.
 */
const DRILL_DATABASE = 'family_menu_restore_drill';

function tool(name) {
  return process.env.PG_BIN ? path.join(process.env.PG_BIN, name) : name;
}

/** Runs a pg tool against `url`, passing its password by environment, not on the command line. */
function run(name, args, url) {
  const target = new URL(url);
  const password = decodeURIComponent(target.password);
  target.password = '';
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

function withDatabase(serverUrl, database) {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.href;
}

const source = process.env.SOURCE_DATABASE_URL;
const server = process.env.DRILL_SERVER_URL;
const directory = mkdtempSync(path.join(tmpdir(), 'family-menu-drill-'));
let created = false;
try {
  if (!source || !server) throw new Error('SOURCE_DATABASE_URL and DRILL_SERVER_URL are required.');
  const target = withDatabase(server, DRILL_DATABASE);
  const maintenance = withDatabase(server, 'postgres');
  // The app schema, plus only the migration bookkeeping from `public` (a fresh database already
  // has a public schema, and a managed one such as Supabase keeps other objects there).
  const appDump = path.join(directory, 'app.dump');
  const metaDump = path.join(directory, 'migrations.dump');
  const common = ['--format=custom', '--no-owner', '--no-acl'];
  const dumpMs =
    run('pg_dump', [...common, '--schema=app', `--file=${appDump}`], source) +
    run(
      'pg_dump',
      [
        ...common,
        '--table=public.kysely_migration',
        '--table=public.kysely_migration_lock',
        `--file=${metaDump}`,
      ],
      source,
    );
  run(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-qc', `create database ${DRILL_DATABASE}`, '--dbname'],
    maintenance,
  );
  created = true;
  const restore = ['--no-owner', '--no-acl', '--exit-on-error'];
  const restoreMs =
    run('pg_restore', [...restore, appDump, '--dbname'], target) +
    run('pg_restore', [...restore, metaDump, '--dbname'], target);
  const [before, after] = await Promise.all([snapshot(source), snapshot(target)]);
  const problems = compare(before, after);
  console.log(
    JSON.stringify(
      {
        latestMigration: after.migrations.at(-1) ?? null,
        tables: Object.keys(after.counts).length,
        rows: Object.values(after.counts).reduce((sum, n) => sum + n, 0),
        photos: after.photos.count,
        dumpSeconds: Math.round(dumpMs / 100) / 10,
        restoreSeconds: Math.round(restoreMs / 100) / 10,
        result: problems.length === 0 ? 'match' : 'mismatch',
        problems,
      },
      null,
      2,
    ),
  );
  if (problems.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(`Restore drill failed: ${error instanceof Error ? error.message : 'unknown'}`);
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
  if (created && process.env.KEEP_DRILL_DATABASE !== '1') {
    try {
      run(
        'psql',
        ['-qc', `drop database ${DRILL_DATABASE}`, '--dbname'],
        withDatabase(server, 'postgres'),
      );
    } catch {
      console.error(`Drop ${DRILL_DATABASE} manually.`);
    }
  }
}
