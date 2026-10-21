import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, DUMP_OPTIONS, DUMPS, run } from './pg-tools.mjs';
import { readSnapshot } from './restore-check.mjs';

/**
 * Database backup (REL-001, ADR 0011). Writes the app schema and migration bookkeeping as
 * pg_dump custom-format files, plus manifest.json with the migrations, per-table row counts and
 * photo digest taken from the same snapshot, so a restore drill can prove the copy is complete.
 *
 *   BACKUP_DATABASE_URL  the read-only backup login (libpq URL, e.g. `?sslmode=require`)
 *   BACKUP_DIR           a new or empty directory for the files; encrypting and storing them is
 *                        the caller's job (the scheduled workflow uses age)
 *   PG_BIN               optional directory of pg_dump matching the server's major version
 *
 * `--server-major` prints only the server's major version, to pick matching client tools.
 * Output is counts and timings only; credentials and row contents are never printed.
 */
export async function backup(databaseUrl, directory) {
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length > 0) throw new Error('BACKUP_DIR must be empty.');
  const connection = client(databaseUrl);
  await connection.connect();
  try {
    // Every dump and the manifest read the same exported snapshot, so they agree exactly.
    await connection.query('begin isolation level repeatable read read only');
    const { rows } = await connection.query(
      `select pg_export_snapshot() as snapshot, current_setting('server_version_num') as version`,
    );
    const facts = await readSnapshot(connection);
    let dumpMs = 0;
    for (const dump of Object.values(DUMPS)) {
      dumpMs += run(
        'pg_dump',
        [
          ...DUMP_OPTIONS,
          ...dump.args,
          `--snapshot=${rows[0].snapshot}`,
          `--file=${path.join(directory, dump.file)}`,
        ],
        databaseUrl,
      );
    }
    await connection.query('commit');
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      serverMajor: Math.floor(Number(rows[0].version) / 10000),
      ...facts,
    };
    writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { manifest, dumpMs };
  } finally {
    await connection.end();
  }
}

async function serverMajor(databaseUrl) {
  const connection = client(databaseUrl);
  await connection.connect();
  try {
    const { rows } = await connection.query(`select current_setting('server_version_num') as v`);
    return Math.floor(Number(rows[0].v) / 10000);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const url = process.env.BACKUP_DATABASE_URL;
    if (!url) throw new Error('BACKUP_DATABASE_URL is required.');
    if (process.argv.includes('--server-major')) {
      console.log(await serverMajor(url));
    } else {
      if (!process.env.BACKUP_DIR) throw new Error('BACKUP_DIR is required.');
      const { manifest, dumpMs } = await backup(url, process.env.BACKUP_DIR);
      console.log(
        JSON.stringify(
          {
            latestMigration: manifest.migrations.at(-1) ?? null,
            tables: Object.keys(manifest.counts).length,
            rows: Object.values(manifest.counts).reduce((sum, n) => sum + n, 0),
            photos: manifest.photos.count,
            dumpSeconds: Math.round(dumpMs / 100) / 10,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    // Error messages from pg and pg tools here never include the password.
    console.error(`Backup failed: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exitCode = 1;
  }
}
