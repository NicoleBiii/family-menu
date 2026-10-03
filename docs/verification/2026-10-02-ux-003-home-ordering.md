# UX-003 Home, Ordering and Confirmation Pages — 2026-10-02

Scope: the page/ordering part of the [home-ordering proposal](../proposals/2026-10-02-home-ordering.md) (acceptance criteria 1–3 and the ordering part of 5). Grouped per-dish shopping checks (criterion 4) are a separate, later PR. Branch `codex/ux-003-home-ordering`, based on `main` at `52350a6`. Codex started the implementation; Claude Code completed it after Codex stopped at its usage limit. This is a web-only change: no API, database migration or new dependency.

## Acceptance evidence

| Criterion                                                           | Evidence                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home outside the bottom tabs; menu and ordering below the intro     | The bottom navigation holds Orders, Shopping and Household; the brand returns to `/` in-app. `shell.spec.ts`: signed-out Home shows the menu section with sign-in; `basket.spec.ts`/`orders.spec.ts` return Home through the brand link                                                               |
| Clear route to `/recipes`; recipe management still works there      | Every recipe, category, AI-draft and photo spec now enters management through "Manage recipes & menu" (`/recipes`) and passes; signed-out starter recipes load directly at `/recipes` (`shell.spec.ts`, `localization.spec.ts`)                                                                       |
| Category rail, dish details, Add/serving controls, basket count     | `basket.spec.ts`: rail links per category (Soups, Uncategorised) jump to their section; dishes show name, description, points and a photo or placeholder; the basket badge shows the serving count (4) next to a dishes/servings/points summary                                                       |
| Basket review opens `/checkout`; Back preserves an unsent basket    | Review basket goes to `/checkout` with its own page heading; browser Back and Forward, and "Add more dishes", keep servings and notes; one Place order creates exactly 1 order and opens `/meals` with the saved notice                                                                               |
| `/meals` has only Pending and History; shared editing preserved     | `basket.spec.ts` asserts the Orders view group is exactly Upcoming/History; `orders.spec.ts` edit, done, DST and stale-conflict cases pass; integration AC-03/AC-04 member-editing tests unchanged and passing                                                                                        |
| Archived dishes                                                     | A dish archived after it was added is removed with a notice both on Home and when `/checkout` is opened directly, before the confirmation form is filled                                                                                                                                              |
| English/Chinese, keyboard, accessibility, no payment/delivery added | Chinese basket summary and Chinese recipe→basket→order flow pass; keyboard-only flow at 360 px reaches Home, Manage, Add to basket, servings, Review and Place order with every control visible; axe scans of signed-out Home, Recipes, Orders, the dish browser with basket and `/checkout` report 0 |

## Changes made while completing Codex's partial work

- Restored the "Some dishes are no longer on the menu" notice (Codex's Home silently dropped archived dishes) and guarded it so a household switch cannot prune the new household's basket with the old menu.
- `/checkout` now shows loading while the session loads instead of "basket empty", prunes archived dishes before the editor copies the basket, and keeps the editor mounted when the last dish is removed (Place order disabled) instead of swapping pages.
- Phones keep "Empty basket" as an icon button (Codex's CSS hid it entirely below 600 px). The empty-menu call to action is labelled "Add recipes" so it does not duplicate the "Manage recipes & menu" button name.
- Adding from the Recipes dialog again confirms "Added … to the basket." on Home. The brand link navigates in-app instead of reloading.
- The Recipes page wrapper is no longer a nested `<section>`; the category rail's accessible names exclude the visual counts.

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database:

- Full `npm run check`: format, lint, typechecks, production builds, 85/85 integration tests and 78/78 desktop/mobile browser cases passed.
- Before the final run, the first browser run after updating the specs had 76/78 passing; the two failures were the signed-out localization search case still starting at `/`. It now starts at `/recipes` and passed in a focused run (8/8) and in the full run.
- The agent reviewed screenshots of Home at 1280, 820 and 360 px and of `/checkout` at 360 px, then narrowed the phone category rail to avoid mid-word breaks.

## Merge and staging

PR #26 Quality checks passed on `b402b2a`; it was squash-merged to `main` as `2cd7328` at the owner's request. GitHub's staging deployment record `6820203779` for `2cd7328` reports success at 23:16:20 UTC on 2026-10-02. Afterwards, the public readiness endpoint returned `{"status":"ready"}`, and staging served the same web bundle as the local build of the merged source. Railway's own deployment ID and logs were not inspected.

## Owner review on staging (reported 2026-10-02)

- The new Chinese labels look good on the owner's phone.
- The screen-reader check of the category rail and basket badge was reported good. Exact assistive technology and steps were not specified.
- At 200% browser zoom on a laptop, the bottom navigation was too narrow and its Chinese labels stacked one character per line. Cause: the fixed bar was centred with `left: 50%` and `translateX(-50%)`, so its width was capped at half the viewport. In the test browser's fonts the Chinese labels need 318 px of the 350 px available at a 701 px viewport, so a slightly wider font wraps them. The follow-up on `claude/ux-003-nav-zoom` centres the bar with `left: 0; right: 0; margin-inline: auto; width: max-content`, keeps labels on one line, and adds a `shell.spec.ts` regression case (labels widened by letter spacing at 701 px). That case fails on the old CSS and passes on the fix. Full `npm run check` passed with the fix: 85 integration and 80 browser cases. The owner has not re-checked on the laptop yet.

Further owner feedback after reviewing the new ordering flow on staging: Home was reachable only through the brand, recipe management had no way back, and its entry button was not prominent enough. On the same branch (see the proposal's owner review amendment):

- A Menu (点菜) tab now opens Home at the dish browser. It is also marked (`aria-current="true"`) on `/recipes` and `/checkout`.
- `/recipes` has a Back button. It uses browser history after in-app navigation and falls back to ordering when the page was opened directly.
- "Manage recipes & menu" is now a filled card button with a description line, full width on phones.
- `shell.spec.ts` covers the tab state, Back after in-app navigation, Back on a direct visit, and the Menu tab from Shopping; `states.spec.ts` reaches Home through the Menu tab. The agent reviewed Chinese screenshots at 1280, 701 and 360 px: four tabs fit on one line. Full `npm run check` passed: 85 integration, 80 browser cases.

After PR #27 merged as `80a9076` (staging deployment `6820470370`, success), the owner reported no problems with the Menu tab, the Back button, the Manage button or the laptop at 200% zoom. On 2026-10-03 they reported that phone Chrome at 200% text zoom (including the basket bar) had no problems.

## Not verified

- Exact screen-reader steps were not specified; the owner reported the check as good.
