import { sql } from 'kysely';

// REC-001: household-owned recipes with structured ingredient lines.
// Curated presets are versioned read-only data in the API (apps/api/src/presets.ts); a household
// recipe created from one records the preset id but is an independent copy.
export async function up(db) {
  await sql`
    create table app.recipes (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      name text not null check (length(trim(name)) between 1 and 120),
      description text not null default '' check (length(description) <= 500),
      servings integer not null check (servings between 1 and 100),
      price_points integer not null default 0 check (price_points between 0 and 9999),
      steps text[] not null default '{}' check (cardinality(steps) <= 30),
      source text not null check (source in ('manual', 'preset')),
      source_preset_id text check (length(source_preset_id) between 1 and 100),
      source_preset_version integer check (source_preset_version >= 1),
      create_request_id uuid not null,
      revision integer not null default 1 check (revision >= 1),
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      updated_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      archived_at timestamptz,
      check (
        (source = 'preset') = (source_preset_id is not null)
        and (source_preset_id is null) = (source_preset_version is null)
      ),
      unique (household_id, id),
      unique (household_id, create_request_id)
    )
  `.execute(db);

  // The composite key keeps every ingredient line in its recipe's household.
  await sql`
    create table app.recipe_ingredients (
      household_id uuid not null,
      recipe_id uuid not null,
      position integer not null check (position between 0 and 59),
      name text not null check (length(trim(name)) between 1 and 100),
      ingredient_key text not null check (length(ingredient_key) between 1 and 100),
      quantity numeric check (quantity > 0 and quantity <= 100000 and scale(quantity) <= 3),
      unit text check (unit in (
        'g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup',
        'piece', 'clove', 'slice', 'can', 'bunch', 'pinch'
      )),
      form text check (length(form) between 1 and 60),
      note text check (length(note) between 1 and 200),
      primary key (recipe_id, position),
      foreign key (household_id, recipe_id)
        references app.recipes(household_id, id) on delete cascade,
      check (unit is null or quantity is not null)
    )
  `.execute(db);
}

// Forward-only by design: a production rollback must not silently delete household data.
