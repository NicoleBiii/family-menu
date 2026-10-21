import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { backup } from './backup.mjs';
import { compare, snapshot } from './restore-check.mjs';
import { run } from './pg-tools.mjs';

/**
 * Restore drill (REL-001, ADR 0010/0011): restore a backup into a new, empty database on a
 * separate server and compare migrations, row counts and photo bytes with the backup's manifest.
 *
 *   BACKUP_DIR           a decrypted backup made by scripts/backup.mjs (app.dump,
 *                        migrations.dump, manifest.json); or, instead:
 *   SOURCE_DATABASE_URL  a live database to back up first into a private temporary directory
 *   DRILL_SERVER_URL     an empty-able server for the copy, e.g. a local PostgreSQL of the same
 *                        or newer major version; a database named family_menu_restore_drill is
 *                        created there and dropped afterwards unless KEEP_DRILL_DATABASE=1
 *   PG_BIN               optional directory of pg tools matching the source version
 *
 * A temporary backup is deleted at the end; a given BACKUP_DIR is left untouched. Output is
 * counts and timings only; credentials and row contents are never printed.
 */
const DRILL_DATABASE = 'family_menu_restore_drill';

function withDatabase(serverUrl, database) {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.href;
}

function readManifest(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1) throw new Error('Unsupported backup manifest format.');
  return manifest;
}

const source = process.env.SOURCE_DATABASE_URL;
const server = process.env.DRILL_SERVER_URL;
const given = process.env.BACKUP_DIR;
const temporary = given ? null : mkdtempSync(path.join(tmpdir(), 'family-menu-drill-'));
let created = false;
try {
  if (!server || !(given || source)) {
    throw new Error('DRILL_SERVER_URL and either BACKUP_DIR or SOURCE_DATABASE_URL are required.');
  }
  let dumpMs = 0;
  const directory = given ?? temporary;
  if (!given) dumpMs = (await backup(source, directory)).dumpMs;
  const manifest = readManifest(directory);
  const target = withDatabase(server, DRILL_DATABASE);
  run(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-qc', `create database ${DRILL_DATABASE}`, '--dbname'],
    withDatabase(server, 'postgres'),
  );
  created = true;
  const restore = ['--no-owner', '--no-acl', '--exit-on-error'];
  const restoreMs =
    run('pg_restore', [...restore, path.join(directory, 'app.dump'), '--dbname'], target) +
    run('pg_restore', [...restore, path.join(directory, 'migrations.dump'), '--dbname'], target);
  const after = await snapshot(target);
  const problems = compare(manifest, after);
  console.log(
    JSON.stringify(
      {
        backupCreatedAt: manifest.createdAt,
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
  if (temporary) rmSync(temporary, { recursive: true, force: true });
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
