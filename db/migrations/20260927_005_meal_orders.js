import { sql } from 'kysely';

// ORD-001: household meal orders with immutable recipe snapshots, optimistic revisions,
// idempotent creation, and a minimal audit trail.
export async function up(db) {
  await sql`
    create table app.meal_orders (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      status text not null default 'pending'
        check (status in ('pending', 'completed', 'cancelled')),
      -- The instant of the meal plus the household-local reading it was scheduled with. Grouping
      -- uses meal_date so history keeps the day it was planned for.
      scheduled_at timestamptz not null,
      meal_date date not null,
      meal_time time(0) not null,
      timezone text not null,
      notes text not null default '' check (length(notes) <= 1000),
      create_request_id uuid not null,
      revision integer not null default 1 check (revision >= 1),
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      updated_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      closed_by uuid references app.user_profiles(id) on delete restrict,
      closed_at timestamptz,
      check ((status = 'pending') = (closed_at is null)),
      check ((closed_at is null) = (closed_by is null)),
      unique (household_id, id),
      unique (household_id, create_request_id)
    )
  `.execute(db);
  await sql`create index meal_orders_pending on app.meal_orders (household_id, scheduled_at) where status = 'pending'`.execute(
    db,
  );
  await sql`create index meal_orders_history on app.meal_orders (household_id, closed_at desc) where status <> 'pending'`.execute(
    db,
  );

  // Each item is a snapshot of the recipe when it was ordered. recipe_id is kept only as a link;
  // later recipe edits or archiving never change these columns.
  await sql`
    create table app.meal_order_items (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null,
      order_id uuid not null,
      position integer not null check (position between 0 and 19),
      recipe_id uuid not null,
      servings integer not null check (servings between 1 and 100),
      recipe_name text not null check (length(trim(recipe_name)) between 1 and 120),
      recipe_servings integer not null check (recipe_servings between 1 and 100),
      price_points integer not null check (price_points between 0 and 9999),
      steps text[] not null,
      ingredients jsonb not null check (jsonb_typeof(ingredients) = 'array'),
      recipe_revision integer not null,
      snapshot_at timestamptz not null default now(),
      unique (order_id, position) deferrable initially deferred,
      foreign key (household_id, order_id)
        references app.meal_orders(household_id, id) on delete cascade,
      -- NO ACTION (checked at statement end) lets a household delete cascade through both
      -- recipes and orders while still refusing to delete an ordered recipe on its own.
      foreign key (household_id, recipe_id)
        references app.recipes(household_id, id)
    )
  `.execute(db);
  await sql`create index meal_order_items_by_recipe on app.meal_order_items (recipe_id)`.execute(
    db,
  );

  // Minimal mutation audit: who did what to which record, at which revision. Not event sourcing.
  await sql`
    create table app.audit_events (
      id bigint generated always as identity primary key,
      household_id uuid not null references app.households(id) on delete cascade,
      actor_id uuid not null references app.user_profiles(id) on delete restrict,
      entity_type text not null check (entity_type in ('meal_order')),
      entity_id uuid not null,
      action text not null check (action in ('create', 'update', 'complete', 'cancel')),
      revision integer not null,
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`create index audit_events_by_entity on app.audit_events (entity_type, entity_id)`.execute(
    db,
  );
}

// Forward-only by design: a production rollback must not silently delete household data.
