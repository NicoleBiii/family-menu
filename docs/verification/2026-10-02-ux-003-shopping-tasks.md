# UX-003 Per-Dish Shopping Checks — 2026-10-02

Scope: acceptance criterion 4 of the [home-ordering proposal](../proposals/2026-10-02-home-ordering.md), via the [ADR 0009 amendment](../decisions/0009-shopping-purchases.md#amendment--per-dish-checks-in-the-by-day-view-ux-003-2026-10-02). Branch `claude/ux-003-shopping-groups`, based on `main` at `80a9076`. No migration and no new dependency. The check route gains an optional `orderItemId`, and by-day dishes gain `tasks`; OpenAPI was regenerated.

## Acceptance evidence

| Criterion                                            | Evidence                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A checkable row for every ingredient of each dish    | Pure test: Cake's two egg lines are one task (3), listed with Salt in the dish's own order; each dish has its own token. Browser: "Bought Egg for Omelette" and "… for Fried rice" are separate checkboxes                                              |
| Checking one row updates combined demand and history | Integration: checking the cake's eggs records a 3-egg purchase by the member. The combined line keeps 2 to buy with 3 bought and "partly bought". Browser: the other member's combined list shows "1 whole" and "Already bought 2 whole"                |
| Another dish's share stays independently manageable  | The omelette's egg task stays open after the cake check and is checked separately. Undoing the cake purchase reopens only the cake; history keeps both purchases, one marked undone                                                                     |
| Combined checks are reflected and undone together    | A combined check marks every covered dish bought with `shared: true`. Undoing it from one dish reopens all of them (integration). In the browser, the warning can be dismissed (still checked) or accepted (both dishes reopen)                         |
| Date filtering, stale tokens, concurrent members     | Re-checking a covered task, or two members checking from the same view, records one purchase and returns 409. Out-of-scope, unrelated, missing and other-household dishes return 409; a malformed id returns 400; another household's route returns 404 |
| Unknown quantities and incompatible units            | "To taste" tasks are checkable without an amount; lines stay separated by form and unit family as before (existing reconciliation tests)                                                                                                                |
| English/Chinese, mobile                              | Chinese task labels ("已买 Egg（Fried rice）：1 个") in the browser case; desktop and 360 px runs; no horizontal scroll; the agent reviewed a 360 px Chinese screenshot of the by-day view                                                              |

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database: full `npm run check` passed: format, lint, typechecks, production builds, 88/88 integration tests (3 new) and 82/82 desktop/mobile browser cases (2 new). `npm run openapi` regenerated `docs/api/openapi.json`. The earlier `shopping.spec.ts` by-day assertions expected the old "amount name" text and the recipe's own unit (0.2 kg). They now expect a checkable row and 200 g, matching the combined list.

## Merge and owner review on staging

PR #28 Quality checks passed and it was squash-merged as `4260c1e` at the owner's request. GitHub staging deployment `6820788394` reports success at 00:07:29 UTC on 2026-10-03. Readiness returned `ready`, and the staging OpenAPI lists `orderItemId`.

The owner reported on 2026-10-03:

- Checking one dish's ingredient in By day left the other dish open. The combined list kept only the rest and history gained the purchase: no problems.
- The first shared-undo attempt showed no prompt and reopened one dish. Most likely the ingredient (egg) had already been checked for the other dish, so the combined check covered only one dish. That is designed behaviour, and the integration test covers it. The owner did not confirm which ingredient they used. A retest with an ingredient unchecked in both dishes showed the prompt, and confirming reopened both dishes.
- Chrome 200% text zoom on the phone: no problems.

## Not verified

- Very long lists (many dishes per day) for scrolling comfort.
- Exact screen-reader steps were not specified.
