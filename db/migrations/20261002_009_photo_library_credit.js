import { sql } from 'kysely';

// The private image remains the same normalized WebP. Credit is attached to that image,
// so replacing it with a manual upload removes the previous attribution atomically.
export async function up(db) {
  await sql`
    alter table app.recipe_images
      add column source_provider text,
      add column source_url text,
      add column photographer text,
      add column photographer_url text,
      add constraint recipe_images_source_check check (
        (source_provider is null and source_url is null and photographer is null and photographer_url is null)
        or
        (source_provider = 'pexels' and source_url is not null and photographer is not null and photographer_url is not null)
      )
  `.execute(db);
}

// Forward-only: a rollback must not discard photo attribution.
