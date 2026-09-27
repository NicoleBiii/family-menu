# ADR 0003 — Household recipes and curated presets

Date: 2026-09-26. Status: implemented and locally verified (REC-001), including recipe photos.

## Decisions

- **Structured recipes.** `app.recipes` holds name, description, base servings (1–100), virtual price as integer points per serving (0–9999, display-only), ordered steps (`text[]`, ≤ 30) and provenance. `app.recipe_ingredients` holds ordered lines: display name, a normalized `ingredient_key` (NFKC, lower case, collapsed spaces) for later shopping aggregation, optional quantity, unit, form/preparation and note. A composite foreign key `(household_id, recipe_id)` keeps every line in its recipe's household.
- **Exact quantities.** Quantities are PostgreSQL `numeric`, accepted as a decimal string or JSON number with at most three fraction digits and normalized (`0.50` → `0.5`). Values that cannot be written exactly (such as `0.1 + 0.2`) are rejected, never rounded. Blank quantity means "to taste"/unknown; the app never invents an amount. A unit requires a quantity.
- **Controlled units.** `g, kg, oz, lb, ml, l, tsp, tbsp, cup` plus count units `piece, clove, slice, can, bunch, pinch`; a blank unit means whole items. A fixed list keeps SHOP-001 conversions deterministic. Extending it needs a migration and SHOP-001 conversion rules.
- **Presets are code, not rows.** The ~12 curated starters live in `apps/api/src/presets.ts` with a `version`, are served publicly at `GET /api/recipe-presets` (no household data), and are never written by the API. Saving one creates an independent household copy recording `source_preset_id` and `source_preset_version`; editing the copy cannot change the preset (AC-05). Provenance: [docs/presets/PROVENANCE.md](../presets/PROVENANCE.md). Presets carry no price or photo.
- **Shared editing with conflicts.** Every member may create, edit, archive and restore any household recipe (confirmed shared-menu rule). Writes are full replacements that carry `expectedRevision`; the conditional `UPDATE … WHERE revision = expected` makes a concurrent or stale save fail with 409 instead of overwriting. The UI offers "Load the latest version (discards your changes)".
- **Idempotent creation.** Each editor session sends a client-generated `requestId`; `unique (household_id, create_request_id)` plus `ON CONFLICT DO NOTHING` makes retries and double taps return the first recipe.
- **Membership race.** Recipe writes run in a transaction that first reads the caller's membership row `FOR SHARE` (`HouseholdsService.requireMember(..., lock = true)`). A concurrent removal's `DELETE` waits for the write to commit, or the write sees the removal and gets 404; a removed member cannot complete a mutation after removal commits.
- **Archive, never delete.** Archiving sets `archived_at` and bumps the revision; archived recipes cannot be edited until restored. Recipes created by a member who later leaves stay with the household.
- **Limits.** 500 recipes per household (soft count check), 60 ingredient lines, 30 steps, text length limits in both API validation and table constraints.

## Consequences and limits

- AC-05 and AC-02 for recipes are covered by integration and browser tests; AC-11 (order snapshots) is prepared for by revisions and archiving but belongs to ORD-001.
- The membership `FOR SHARE` lock is reasoned from PostgreSQL row-lock semantics; the tests prove sequential removal blocks access but do not force the interleaving.
- The 500-recipe limit is checked before insert without a lock, so concurrent creates can exceed it slightly. Acceptable for a soft abuse limit.
- There is no audit-event table yet; `created_by`, `updated_by`, timestamps and revision are recorded. The minimal audit event from MVP_SPEC arrives with orders.

## Recipe photos (AC-12)

Owner decision 2026-09-26: store photos in PostgreSQL; dish photos do not need to be high resolution. This supersedes the private object-storage proposal in ARCHITECTURE.md.

- **One optional photo per recipe** in `app.recipe_images` (bytea), keyed to the recipe with the same composite household foreign key as ingredient lines, deleted with the recipe's household.
- **Upload:** `PUT …/recipes/:id/image` with raw `image/jpeg`, `image/png` or `image/webp` bytes, at most 5 MB (413 above that, checked from `Content-Length` and while streaming). The declared type must match the file's magic bytes (415 otherwise), so libvips' other loaders (SVG, TIFF, HEIF, PDF…) never see uploads. Decoding uses `sharp` 0.35.4 with a 40-megapixel input limit.
- **Normalization:** apply EXIF orientation, fit within 1024 × 1024 without enlarging, re-encode as WebP quality 78. Re-encoding drops EXIF/GPS/XMP/ICC metadata. Stored files are capped at 1 MB by a table constraint. The browser also downsizes to 1600 px JPEG before upload, which lets iPhone HEIC photos work in Safari.
- **Serving:** `GET …/recipes/:id/image/:imageId` requires a session and current membership like every household route; other households get 404. Each upload gets a new id, so responses are `Cache-Control: private, max-age=31536000, immutable` and an old id stops working after replacement or removal.
- **Independent of recipe text.** Photo changes do not use or bump the recipe revision; the most recent photo wins. Archived recipes keep their photo but cannot change it (409). Membership and recipe rows are locked during replacement to serialize concurrent uploads.
- **Dependency:** `sharp` ships prebuilt libvips for macOS arm64 and Linux glibc (CI, Debian-slim Dockerfile). `sharp.concurrency(1)` and `cache(false)` bound memory on a small instance.

Limits: no per-household storage quota beyond the 500-recipe limit (≤ about 500 MB worst case, far above expected use); no rate limiting on uploads yet; the Docker image with `sharp` is verified only by CI's container build.
