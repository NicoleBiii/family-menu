# UX-002 Free Photo Library Chooser — 2026-10-02

Scope: the owner-approved [UI expansion](../proposals/2026-10-01-ui-expansion.md) §9 / AC-20. Branch `codex/ux-002-photo-library`, based on `main` at `00770f6` (PR #22 shopping checks merge). The Pexels API shape and attribution guidance were checked against [Pexels' official documentation](https://www.pexels.com/api/documentation/) on 2026-10-02.

## Change and boundaries

- Members can explicitly search Pexels from an existing recipe's photo controls or edit form, preview results, and choose one. The page links to Pexels and shows photographer/source credit. English and Simplified Chinese labels are included. A new recipe is saved before a photo can be attached, matching the existing upload workflow.
- The API key is read only from the optional server-side `PEXELS_API_KEY`. The browser sends the typed search phrase to the household-scoped API, which sends only that phrase to Pexels. Choosing sends only a photo id; the server fetches current metadata from Pexels, requires its image URL to match the configured image origin, rejects redirects and oversized responses, then uses the existing JPEG/PNG/WebP-to-private-WebP normalization and per-recipe membership checks. No recipe text, household id, token or API key is sent to Pexels.
- Additive migration 009 adds source and photographer credit to `app.recipe_images`. Replacing a library photo with a manual upload removes its old credit; removing the image removes the record. Other household members can see the credit with the shared recipe, while non-members still get 404 for its image.
- Without a key, or when Pexels fails, the chooser explains the outage. Recipe saving, manual photo upload and removal remain available. Pexels is not used for automatic photo selection or generated images.
- The full browser run exposed an existing Shopping date-range race: a slower response for an earlier range could replace the newer list. `ShoppingPage` now ignores stale load results.

## Verification

- `npm ci --offline` on Node 24.19.0: passed, zero reported vulnerabilities.
- Pexels integration tests use a local HTTP stub and the real loopback `family_menu_test` database. They cover explicit search, private import and WebP storage, metadata, cross-household 404, an unsafe image URL, an image outage, the missing-key fallback and manual replacement. Focused run: 2/2 passed.
- Desktop and 360 px mobile browser tests cover a missing-key message, manual upload after the failed search and Chinese labels in the edit form. Focused run: 2/2 passed.
- The first full `npm run check` passed format, lint, types, builds and 85/85 integration tests; browser results were 77/78, with one pre-existing Shopping range test failing from the response-order race above. After the fix, that test passed in a focused desktop/mobile run (2/2). The second full `npm run check` passed format, lint, types, builds, 85/85 integration tests and 78/78 desktop/mobile browser cases. `git diff --check` passed before implementation commit `3d2f5bb`.
- OpenAPI regenerated. Migration 009 ran only against `family_menu_test` in the test harness; it has not been applied to the development database or staging.

## Remaining verification

- No real Pexels key or provider request was used locally. Staging needs a server-side key, migration 009 result and a manual search/import check before calling the live integration verified.
- Owner review on a physical phone, the detailed UX-001 screen-reader checklist, and real iMessage preview remain open.
