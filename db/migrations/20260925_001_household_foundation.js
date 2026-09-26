import { sql } from 'kysely';

export async function up(db) {
  await sql`create schema app`.execute(db);
  await sql`revoke all on schema app from public`.execute(db);
  await sql`
    create table app.user_profiles (
      id uuid primary key,
      display_name text not null check (length(trim(display_name)) between 1 and 100),
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table app.households (
      id uuid primary key default gen_random_uuid(),
      name text not null check (length(trim(name)) between 1 and 100),
      timezone text not null default 'America/Toronto',
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table app.household_members (
      household_id uuid not null references app.households(id) on delete cascade,
      user_id uuid not null references app.user_profiles(id) on delete restrict,
      role text not null check (role in ('owner', 'member')),
      created_at timestamptz not null default now(),
      primary key (household_id, user_id)
    )
  `.execute(db);
  await sql`create index household_members_by_user on app.household_members (user_id)`.execute(db);
}

// Forward-only by design: a production rollback must not silently delete household data.
