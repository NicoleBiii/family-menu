import { sql } from 'kysely';

// AUTH-001: server-side sessions, single-use OAuth state, and household invitations.
// Secrets (session tokens, invitation tokens) are stored only as SHA-256 hashes.
export async function up(db) {
  await sql`alter table app.user_profiles add column email text`.execute(db);
  await sql`alter table app.user_profiles add column updated_at timestamptz not null default now()`.execute(
    db,
  );

  await sql`
    create table app.oauth_states (
      state_hash bytea primary key,
      code_verifier text not null,
      return_to text not null check (return_to like '/%' and return_to not like '//%'),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index oauth_states_by_expiry on app.oauth_states (expires_at)`.execute(db);

  await sql`
    create table app.sessions (
      id uuid primary key default gen_random_uuid(),
      token_hash bytea not null unique,
      user_id uuid not null references app.user_profiles(id) on delete cascade,
      csrf_token text not null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz
    )
  `.execute(db);
  await sql`create index sessions_by_user on app.sessions (user_id)`.execute(db);

  await sql`
    create table app.household_invitations (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      token_hash bytea not null unique,
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz,
      accepted_by uuid references app.user_profiles(id) on delete set null,
      accepted_at timestamptz,
      check (expires_at > created_at),
      check (accepted_by is null or accepted_at is not null)
    )
  `.execute(db);
  await sql`create index household_invitations_by_household on app.household_invitations (household_id)`.execute(
    db,
  );
}

// Forward-only by design: a production rollback must not silently delete household data.
