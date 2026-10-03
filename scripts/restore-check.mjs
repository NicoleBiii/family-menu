import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Restore drill check (REL-001, ADR 0010). Compares a restored database with its source: the
 * applied migrations, the row count of every table in `app`, and a digest of all recipe photo
 * bytes (photos live in PostgreSQL, ADR 0003). Prints counts only, never row contents.
 */
export async function snapshot(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const tables = await client.query(
      `select table_name from information_schema.tables
        where table_schema = 'app' and table_type = 'BASE TABLE' order by table_name`,
    );
    const counts = {};
    for (const { table_name: table } of tables.rows) {
      const result = await client.query(
        `select count(*)::bigint as n from app.${client.escapeIdentifier(table)}`,
      );
      counts[table] = Number(result.rows[0].n);
    }
    const migrations = await client.query('select name from public.kysely_migration order by name');
    const photos = await client.query(
      `select count(*)::int as n,
              coalesce(md5(string_agg(md5(content), '' order by id)), '') as digest
         from app.recipe_images`,
    );
    await client.query('commit');
    return {
      migrations: migrations.rows.map((row) => row.name),
      counts,
      photos: { count: photos.rows[0].n, digest: photos.rows[0].digest },
    };
  } finally {
    await client.end();
  }
}

export function compare(source, restored) {
  const problems = [];
  if (JSON.stringify(source.migrations) !== JSON.stringify(restored.migrations)) {
    problems.push('applied migrations differ');
  }
  for (const table of new Set([...Object.keys(source.counts), ...Object.keys(restored.counts)])) {
    if (source.counts[table] !== restored.counts[table]) {
      problems.push(`app.${table}: ${source.counts[table]} rows vs ${restored.counts[table]}`);
    }
  }
  if (source.photos.digest !== restored.photos.digest) problems.push('photo bytes differ');
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [source, restored] = await Promise.all([
      snapshot(process.env.SOURCE_DATABASE_URL),
      snapshot(process.env.RESTORED_DATABASE_URL),
    ]);
    const problems = compare(source, restored);
    console.log(
      JSON.stringify(
        {
          latestMigration: restored.migrations.at(-1) ?? null,
          tables: Object.keys(restored.counts).length,
          rows: Object.values(restored.counts).reduce((sum, n) => sum + n, 0),
          photos: restored.photos.count,
          counts: restored.counts,
          result: problems.length === 0 ? 'match' : 'mismatch',
          problems,
        },
        null,
        2,
      ),
    );
    if (problems.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`Restore check failed: ${error instanceof Error ? error.message : 'unknown'}`);
    process.exitCode = 1;
  }
}
