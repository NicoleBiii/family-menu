# ADR 0003 — Household recipes and curated presets

Date: 2026-09-26. Status: implemented and locally verified (REC-001, recipes part). Recipe images are not yet implemented; see "Open decision".

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

## Open decision: recipe images (AC-12)

Not implemented. The architecture proposal assumed private Supabase Storage with short-lived signed URLs. That requires a server-side Supabase secret key (the current config deliberately accepts only a publishable key), bucket setup, a storage stub for tests and an image-processing dependency. A smaller alternative is storing re-encoded, size-limited images in PostgreSQL and serving them through the authorized API. The owner chooses before image work starts.
