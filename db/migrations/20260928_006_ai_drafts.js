import { sql } from 'kysely';

// AI-001: durable AI recipe-draft requests with cost reservations, and AI provenance on recipes.
// One row is both the job (queued → running → succeeded/failed) and its cost reservation:
// reserved_micros is the worst-case provider charge, charged_micros the known actual charge.
// Monthly spend counts coalesce(charged_micros, reserved_micros), so an unknown outcome keeps
// its full reservation.
export async function up(db) {
  await sql`
    create table app.ai_draft_requests (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      create_request_id uuid not null,
      dish_name text not null check (length(trim(dish_name)) between 1 and 80),
      preferences text not null default '' check (length(preferences) <= 300),
      status text not null default 'queued'
        check (status in ('queued', 'running', 'succeeded', 'failed')),
      provider text not null check (length(provider) between 1 and 40),
      model text not null check (length(model) between 1 and 100),
      reserved_micros bigint not null check (reserved_micros >= 0),
      charged_micros bigint check (charged_micros >= 0),
      input_tokens integer check (input_tokens >= 0),
      output_tokens integer check (output_tokens >= 0),
      lease_expires_at timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      latency_ms integer check (latency_ms >= 0),
      error_code text check (error_code in (
        'timeout', 'provider_error', 'invalid_output', 'refused', 'interrupted', 'expired'
      )),
      draft jsonb check (jsonb_typeof(draft) = 'object'),
      saved_recipe_id uuid,
      saved_by uuid references app.user_profiles(id) on delete restrict,
      saved_at timestamptz,
      discarded_by uuid references app.user_profiles(id) on delete restrict,
      discarded_at timestamptz,
      created_at timestamptz not null default now(),
      check ((status = 'succeeded') = (draft is not null)),
      check ((status = 'failed') = (error_code is not null)),
      check ((status = 'running') = (lease_expires_at is not null)),
      check ((saved_recipe_id is null) = (saved_at is null) and (saved_at is null) = (saved_by is null)),
      check ((discarded_at is null) = (discarded_by is null)),
      check (saved_at is null or discarded_at is null),
      check (saved_at is null or status = 'succeeded'),
      unique (household_id, id),
      unique (household_id, create_request_id),
      -- NO ACTION (checked at statement end) lets a household delete cascade through both tables.
      foreign key (household_id, saved_recipe_id) references app.recipes(household_id, id)
    )
  `.execute(db);
  await sql`create index ai_draft_requests_open on app.ai_draft_requests (created_at) where status in ('queued', 'running')`.execute(
    db,
  );
  await sql`create index ai_draft_requests_by_household on app.ai_draft_requests (household_id, created_at desc)`.execute(
    db,
  );
  await sql`create index ai_draft_requests_by_user on app.ai_draft_requests (created_by, created_at desc)`.execute(
    db,
  );
  await sql`create index ai_draft_requests_by_month on app.ai_draft_requests (created_at)`.execute(
    db,
  );

  // A recipe saved from an AI draft records the draft; the unique key makes that save happen once.
  await sql`alter table app.recipes drop constraint recipes_source_check`.execute(db);
  await sql`
    alter table app.recipes
      add constraint recipes_source_check check (source in ('manual', 'preset', 'ai')),
      add column source_ai_draft_id uuid,
      add constraint recipes_ai_source_check check ((source = 'ai') = (source_ai_draft_id is not null)),
      add constraint recipes_source_ai_draft_id_key unique (source_ai_draft_id),
      add constraint recipes_source_ai_draft_fkey foreign key (household_id, source_ai_draft_id)
        references app.ai_draft_requests(household_id, id)
  `.execute(db);
}

// Forward-only by design: a production rollback must not silently delete household data.
