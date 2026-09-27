import { sql } from 'kysely';

// REC-001 images (AC-12): one optional photo per household recipe, stored in PostgreSQL.
// Uploads are re-encoded server-side to small WebP files without metadata before they are
// stored, so the database only ever holds normalized images. A new upload gets a new id, which
// keeps image URLs immutable and cacheable.
export async function up(db) {
  await sql`
    create table app.recipe_images (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null,
      recipe_id uuid not null unique,
      content bytea not null check (octet_length(content) between 1 and 1048576),
      content_type text not null check (content_type = 'image/webp'),
      width integer not null check (width between 1 and 1024),
      height integer not null check (height between 1 and 1024),
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      foreign key (household_id, recipe_id)
        references app.recipes(household_id, id) on delete cascade
    )
  `.execute(db);
}

// Forward-only by design: a production rollback must not silently delete household data.
