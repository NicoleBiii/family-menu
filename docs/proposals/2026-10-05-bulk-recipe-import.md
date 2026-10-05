# REC-002 — Bulk recipe import proposal

Date: 2026-10-05. Status: implemented locally on `codex/rec-002-bulk-import-plan` after the owner asked to start development. The listed thresholds are initial values; staging and owner review remain open. Validation: [REC-002 record](../verification/2026-10-05-rec-002-import.md).

## Purpose and existing foundation

Let a member build a household menu by copying a format and instructions to their own AI assistant, then pasting its structured output into Family Menu. This is an additional manual-entry path; the application makes no model calls and consumes no internal AI draft allowance. Normal application and database costs still apply.

Verified against `main` at `d7e90a7`: recipe input already supports structured ingredients, servings, virtual price points and steps; recipes have one optional household category. All active members may manage both. See [ADR 0003](../decisions/0003-recipes.md), [ADR 0007](../decisions/0007-recipe-categories.md), `apps/api/src/recipes.service.ts` and `apps/api/src/categories.service.ts`.

Current limits are 500 recipes (including archived recipes) and 30 categories per household. Both count checks are currently soft under concurrency. The new feature must not advertise hard caps until all creation paths share the locking described below.

## Member flow

1. Add a visible **Bulk add** entry on `/recipes`, alongside the existing creation options. Open `/recipes/import` as a real page with Back returning to recipe management.
2. Lead with a short explanation, limits, an expandable example, **Copy AI instructions** and **Copy JSON example**. Instructions include the schema, supported units, household category names and a place to specify desired dishes. Category names are copied only on the member's action; do not include member identities, credentials or the full household menu. Explain that pasting the prompt into another assistant shares those category names with that service.
3. Paste into a labelled text area, then choose **Check and preview**. Show recipe count and UTF-8 byte usage. Accept a JSON object, optionally surrounded by one complete `json`/unlabelled Markdown fence. Strip only that wrapper and an optional BOM; reject commentary, truncated JSON, comments and trailing commas. Never execute or heuristically repair input.
4. Show readable recipe summaries (name, category, servings, ingredients/steps expandable), field-specific errors, duplicate warnings, category mappings and remaining household capacity. Each row can be excluded. Corrections happen in the text area; any content, selection or mapping change invalidates the previous confirmation. Excluded invalid rows need not block a valid selection; structural JSON errors block the whole preview.
5. Show the exact operation, e.g. **Import 24 dishes and create 3 categories**. The member explicitly reviews/accepts proposed category creation. No writes happen during preview.
6. Commit the selected recipes and accepted new categories in one transaction. Either all selected data is saved or none is. On success, display counts and a link to recipe management filtered to the imported result where practical. Retain input on errors and uncertain network outcomes; retry the same operation safely.

Keep unsaved state in memory while moving between input and preview. Warn before leaving with unsaved content. Do not silently put household recipe text into persistent browser storage. Switching households invalidates preview and binds a new operation to the newly selected household; recheck before any submit. Use the existing bilingual UI and mobile accessibility conventions.

## Exchange format v1

Use JSON because nested ingredients and steps map directly to the current model. CSV, spreadsheets, files, URLs, pictures and natural-language parsing are outside the first version. No separate top-level categories array is needed: derive used categories from selected recipes, so unused AI suggestions cannot create empty categories.

```json
{
  "version": 1,
  "recipes": [
    {
      "name": "Tomato and egg stir-fry",
      "category": "Home cooking",
      "description": "A simple dish to serve with rice.",
      "servings": 2,
      "pricePoints": 0,
      "ingredients": [
        { "name": "Tomato", "quantity": "300", "unit": "g", "form": "cut into wedges" },
        { "name": "Egg", "quantity": "3", "unit": "piece" },
        { "name": "Cooking oil", "quantity": "1", "unit": "tbsp" },
        { "name": "Salt", "quantity": null, "unit": null, "note": "to taste" }
      ],
      "steps": [
        "Beat the eggs. Heat the oil, scramble the eggs and set aside.",
        "Cook the tomatoes until softened, return the eggs and season."
      ]
    }
  ]
}
```

- Require `version: 1`, a nonempty `recipes` array, and each recipe's `name` and integer `servings`. Category is a name, never an internal database ID. Omitted/null category means Uncategorised.
- Optional defaults: description `""`, pricePoints `0`, ingredients `[]`, steps `[]`; omitted ingredient quantity/unit/form/note become null. Empty ingredients/steps are allowed like manual entry, with an explicit warning that missing ingredients cannot populate shopping demand.
- All quantities describe the entire recipe at its declared base servings, not one serving. Quantities should be decimal strings, positive and at most 100000, with at most three decimal places; finite JSON numbers may also pass the existing exact parser. Fractions such as `"1/2"`, Chinese amount text and `"300g"` are invalid quantities. Unknown/to-taste uses null quantity and null unit; explain that it cannot produce an exact shopping total.
- Units: `g`, `kg`, `oz`, `lb`, `ml`, `l`, `tsp`, `tbsp`, `cup`, `piece`, `clove`, `slice`, `can`, `bunch`, `pinch`, or null. Human-readable ingredient names, notes, categories and recipe text may use Chinese or any Unicode text. Do not silently convert ambiguous units such as bowls or handfuls.
- Reuse existing field constraints: name 120 characters; description 500; servings 1–100; integer pricePoints 0–9999; at most 60 ingredients and 30 steps; ingredient name 100, form 60, note 200; each step 2000; category name 40. Validate with the same counting semantics as the existing parser. Price is display-only virtual points, never a currency amount.
- Reject unknown fields with a path-specific explanation so an AI's `instructions` or `categoryId` cannot be silently lost. Reject unsupported versions. Do not allow imported IDs, household IDs, image URLs, source/provider claims or revisions.
- Maintain a versioned schema and example alongside the parser; use the same constraints for the page, prompt and API contract. No new validation dependency is required by this proposal.

The copied prompt asks for JSON only, preferably 10–20 recipes per AI response, category reuse, consistent ingredient naming, the exact unit vocabulary and complete output. This smaller generation recommendation mitigates truncation in the member's external assistant; it is distinct from our import limit. No universal external AI token limit is assumed.

## Categories and duplicates

Normalize category names using existing NFKC, lower-case and collapsed-whitespace rules. An exact normalized match reuses the household category. Never automatically equate semantic synonyms, translations or singular/plural variants (for example `Soups`, `Soup`, and `汤类`).

Group unmatched category names once in preview. For each, offer **Create this category**, **Use an existing category**, or **Uncategorised**. A member may accept all proposed new categories with one explicit action after seeing the list. When the household is at 30, new-category choices are disabled but mapping and Uncategorised still work. Count only distinct new categories used by selected recipes. Category creation and recipe creation commit together; cancelling or failing creates neither.

Recipe names are not unique business identifiers. Compare normalized names against active and archived household recipes and within this batch. Default to skipping matches with existing records and keeping the first occurrence inside the batch; visibly explain each skip. Allow an explicit **Keep as another recipe** decision. Never overwrite, merge or restore existing recipes through import. An archived match links to the existing restore flow. Semantic near-duplicates are not detected in v1.

At commit, recheck the facts used in confirmation. A deleted/renamed mapped category, new duplicate or newly exhausted capacity returns a conflict and updated preview requirements, with no writes. If another member created exactly the approved new category name in the meantime, reuse it and report the actual created count. Do not silently recreate deleted mapped categories or change confirmed duplicate decisions.

## Proposed limits

| Boundary                               | Initial default                                         | Behavior                                                                                            |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Recipes per pasted document and commit | 1–50                                                    | Ask the member to split larger menus; no hidden automatic chunking                                  |
| Import/preview HTTP body               | 512 KiB UTF-8, including envelope                       | Reject before full parse with 413; show byte-based guidance, including for Chinese text             |
| Recipe content                         | Existing field/array limits above                       | Errors identify recipe index/name and field path                                                    |
| Household storage                      | Existing 500 recipes including archived, 30 categories  | Preview shows room; commit checks selected new rows atomically                                      |
| Preview frequency                      | 20 requests per household per minute                    | 429 with Retry-After; local syntax checks do not use a request                                      |
| New commit attempts                    | 5 per household per minute                              | 429 with Retry-After; safe replay of a completed operation does not consume another write allowance |
| Write concurrency                      | One capacity-changing operation per household at a time | Coordinate in PostgreSQL; separate households remain independent                                    |

These are conservative configurable starting values, not benchmark results. Fifty recipes with unusually long steps may hit the byte cap first; both limits apply. Include the browser's actual serialized request envelope in its byte check. Test 50 representative recipes and boundary-size payloads before confirming limits. Keep existing limits for unrelated routes; inspect and explicitly configure import parsing before the framework's default parser can reject the larger body. Bound malformed/over-limit traffic as well as valid operations. Do not log raw imported content.

## Backend shape and consistency

- `POST /api/households/:id/recipe-imports/preview`: authenticated, household-scoped, write-free validation and preview of normalized recipes, category mappings, duplicates, capacity and errors. Error messages use structured codes/paths for English and Chinese presentation. Bound error output (for example first 100 issues plus remaining count).
- `POST /api/households/:id/recipe-imports`: submit versioned input, selected rows, explicit category/duplicate choices, preview state and a client-created requestId. Fully revalidate server-side; preview is not authority. Enforce session, CSRF and current membership. Client-supplied household/category IDs never bypass membership or composite foreign keys.
- Store an additive import-operation record keyed by `(household_id, request_id)`, with actor/time, canonical payload-and-choice hash and compact result recipe IDs/counts. Record it atomically with recipes/categories. Same key and same normalized intent returns the original result after current authorization; same key with different intent returns 409. Keep the key on double clicks, retries and unknown outcomes. After an uncertain response, resolve the original operation before offering a changed submission. A new deliberate import gets a new key and still goes through duplicate preview. Durable success records survive reload/server restart; do not store the full pasted document. Return a stable operation receipt, not mutable current recipe details.
- Use one database transaction, current membership locking and a consistent household capacity lock. All recipe creation paths (manual, preset, AI save and import) and category creation must participate in the same capacity lock; locking only bulk import does not close the existing soft-cap race. Define one lock order across these paths and category mutations, review deletion/rename interactions, and test the interleavings. Existing category foreign-key protection remains required. Legacy over-cap households cannot add more until capacity policy is satisfied; do not delete or reclassify their data.
- Reuse/refactor recipe validation and transactional inserts; do not issue 50 browser HTTP saves or call a category service that commits outside the import transaction. Count once and bulk-insert ingredient rows where practical rather than repeating full recipe detail reads. Keep imported content on the existing manual provenance path, with import-operation metadata for traceability; external AI output must not masquerade as an internally tracked AI draft.
- Use PostgreSQL-backed rate windows/coordination that work across app instances; no queue, Redis or background worker is needed for this bounded synchronous operation. This requires an additive migration and matching runtime-role grants. Apply migrations only as a controlled implementation/release step, never during this planning task.

## Acceptance criteria and delivery

1. An active member can copy instructions, paste valid Chinese or English data, review it and import multiple immediately usable recipes. Another active member sees them in menu management and ordering, and structured quantities feed shopping correctly.
2. Preview/cancel has zero recipe/category writes. Malformed input, unsupported versions, unknown fields and invalid units produce actionable errors; selected invalid rows cannot save. Images/URLs trigger no remote fetch.
3. Exact category reuse, explicit creation, mapping, Uncategorised, category cap and selection changes behave as specified. Cancelling or a later failure leaves no empty categories.
4. Existing, archived and within-batch duplicate cases are visible, default skips work, intentional same-name copies require a choice, and no existing recipe is overwritten.
5. Database integration tests prove rollback when a later recipe fails, safe retry after a lost success response, conflicting key reuse rejection, cross-household isolation, membership removal and competing capacity-changing writes. Existing individual create/preset/AI paths remain compatible.
6. Boundary tests cover 50/51 recipes, exact body byte limit and multibyte overflow, field maxima, 500/30 capacity, 429 recovery, category deletion/rename/create between preview and commit, and changing duplicate state. Success is not inferred from mocks for database constraints.
7. Mobile 360 px, keyboard use, bilingual errors, Back, leaving with unsaved text, household switching and retry state receive browser coverage. A staged owner trial uses an actual external assistant's JSON; it is separate from deterministic automated tests.
8. Regenerate OpenAPI, run the full `npm run check` against `family_menu_test`, measure a representative maximum batch, then follow PR/Quality checks and staging review. No production deployment is authorized by this proposal.

Implement as one bounded REC-002 feature after the owner accepts the design: shared validation/atomic API and migration first, then page/prompt/preview, then integration/browser verification. A documentation checkpoint is not feature completion. Leave CSV/files, bulk updates, fuzzy category merging, durable draft recovery, background jobs and bulk undo for later demand.
