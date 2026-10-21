import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

export async function migrate(databaseUrl) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations.');
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 }),
    }),
  });
  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: fileURLToPath(new URL('../db/migrations/', import.meta.url)),
      }),
    });
    const { error, results } = await migrator.migrateToLatest();
    if (error) throw error;
    return results ?? [];
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const result of await migrate(
      process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
    )) {
      console.log(`${result.migrationName}: ${result.status}`);
    }
  } catch (error) {
    // Only the error code (e.g. ENOENT, ECONNREFUSED, 28P01) is printed; messages can echo
    // connection details, so they are never logged.
    const code =
      error && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'unknown';
    console.error(
      `Migration failed (code ${code}). Check database access and the migration files; no credentials are logged.`,
    );
    process.exitCode = 1;
  }
}
