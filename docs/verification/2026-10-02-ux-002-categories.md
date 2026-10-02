# UX-002 Recipe Categories — 2026-10-02

Scope: household recipe categories, with preset and AI category suggestions that a member must accept explicitly ([proposal §3](../proposals/2026-10-01-ui-expansion.md), [ADR 0007](../decisions/0007-recipe-categories.md)). Branch `claude/ux-002-categories`, based on `main` at `6f37a93`.

## Change summary

- Additive migration `20261002_007_recipe_categories`: new `app.recipe_categories` table, nullable `recipes.category_id` with a composite household foreign key, and an index. Existing recipes stay Uncategorised. No existing column, constraint or row is changed.
- New member routes `GET/POST /households/:id/categories`, `PUT …/categories/:categoryId` and `POST …/categories/:categoryId/delete` (requires `moveTo`). Recipe create, update and AI save accept an optional `categoryId`.
- Each preset has a suggested category key. AI drafts receive up to 30 household category names and return a `suggestedCategory`. The worst-case AI input estimate rises from 2,500 to 5,000 tokens.
- Web: the recipe editor has a category select, a "Create …" action for suggestions and an inline new-category field. The Menu adds category filter chips, category labels on cards and in the recipe dialog, and a category manager (add, rename, delete with destination). All text is in English and Simplified Chinese, and the AI privacy note now names category names.

## Acceptance evidence

| Criterion (proposal §3)                                     | Evidence                                                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Household-owned categories; one primary category per recipe | `categories.test.mjs`: shared creation by owner and member, case/width-insensitive unique names, idempotent concurrent create, one `categoryId` per recipe, 30-category limit                       |
| Existing and new recipes can be Uncategorised               | Recipes without `categoryId` read as `null`; an update without `categoryId` keeps it and `null` clears it; the editor offers Uncategorised                                                          |
| Members add and rename; renaming preserves links            | Integration rename keeps the recipe's `categoryId`; browser rename shows the new name on the card                                                                                                   |
| Deleting requires reassignment or clearing                  | `moveTo` is required, cannot be the deleted category or a foreign one; active and archived recipes move with new revisions; a stale editor gets 409; deleting to `null` clears; browser delete flow |
| Category changes leave order snapshots intact               | An order placed before rename/delete returns identical `items` afterwards                                                                                                                           |
| Cross-household ids fail                                    | Another household's member gets 404 on every category route; another household's category id is rejected (400) on recipe create, update, AI save and as a delete destination                        |
| Presets suggest but never create silently                   | Browser: "Create “Mains”" creates and selects; the next Mains starter preselects it; an ignored Breakfast suggestion creates no category                                                            |
| AI suggests an existing or new name; rejection creates none | `ai-drafts.test.mjs`: prompt lists household names; suggestion of a new name creates no row; saving with a different chosen category stores only the member's choice; browser accepts a new AI name |
| AI context is bounded; quotas and reservation cover it      | `ai-providers.test.mjs`: names stripped of tags and line breaks, at most 30 lines of at most 40 characters; bad suggestions do not fail drafts; reservations 17,500 / 4,500 / 5,000 micro-USD       |
| Both locales and accessibility                              | Chinese browser flow (suggestion, create, filter, no overflow); axe scans of the recipe editor and the category manager delete confirmation report 0 violations on desktop and mobile               |

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database (migrations applied by the test harness, including 007):

- Full `npm run check`: format, lint, typechecks, production builds, 75/75 integration tests and 66/66 desktop/mobile browser cases passed.
- OpenAPI regenerated in `docs/api/openapi.json`.
- Mobile screenshots of the recipe editor, menu filters and category manager were reviewed by the agent. One notice layout issue was fixed before the final check.

## Not verified

- Migration 007 was not applied to the owner's development database `family_menu` or to staging. The staging pre-deploy migration will apply it on the next deployment. Its result should be recorded with the deployment identity.
- Real Gemini category suggestions were not exercised; only the mock provider and adapter request shapes were tested. The suggestion quality of the real model is unknown.
- The concurrent interleaving of a category delete and a recipe save is reasoned from PostgreSQL row-lock semantics (`FOR UPDATE` against `FOR KEY SHARE`). It is not forced in a test.
- No owner review on a real phone.
