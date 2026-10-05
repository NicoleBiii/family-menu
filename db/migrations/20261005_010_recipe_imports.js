import { sql } from 'kysely';

export async function up(db) {
  await sql`
    create table app.recipe_imports (
      household_id uuid not null references app.households(id) on delete cascade,
      request_id uuid not null,
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      intent_hash text not null check (length(intent_hash) = 64),
      result jsonb not null,
      created_at timestamptz not null default now(),
      primary key (household_id, request_id)
    )
  `.execute(db);
  await sql`
    create table app.recipe_import_rate_windows (
      household_id uuid not null references app.households(id) on delete cascade,
      kind text not null check (kind in ('preview', 'commit')),
      window_started_at timestamptz not null,
      request_count integer not null check (request_count > 0),
      primary key (household_id, kind)
    )
  `.execute(db);
}

// Forward-only: imported household data and retry receipts must be retained.
