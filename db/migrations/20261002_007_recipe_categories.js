import { sql } from 'kysely';

// UX-002 phase 2 (ADR 0007): household-owned recipe categories. A recipe has at most one
// category; null means Uncategorised, so existing recipes stay readable and unclassified.
export async function up(db) {
  await sql`
    create table app.recipe_categories (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      name text not null check (length(trim(name)) between 1 and 40),
      name_key text not null check (length(name_key) between 1 and 40),
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      updated_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (household_id, id),
      unique (household_id, name_key)
    )
  `.execute(db);

  // The composite key keeps a recipe and its category in one household. NO ACTION (checked at
  // statement end) lets a household delete cascade through both tables; the API moves recipes
  // before it deletes a category.
  await sql`
    alter table app.recipes
      add column category_id uuid,
      add constraint recipes_category_fkey foreign key (household_id, category_id)
        references app.recipe_categories(household_id, id)
  `.execute(db);
  await sql`create index recipes_by_category on app.recipes (household_id, category_id)`.execute(
    db,
  );
}

// Forward-only by design: a production rollback must not silently delete household data.
