# UX-002 Shared Shopping Checks — 2026-10-02

Scope: shared shopping checks, reconciliation against order items, undo and purchase history ([proposal §4](../proposals/2026-10-01-ui-expansion.md), [ADR 0009](../decisions/0009-shopping-purchases.md), accepted by the owner on 2026-10-02 with the recommended answers). Branch `claude/ux-002-shopping-design`, based on `main` at `8264565`.

## Change summary

- Additive migration `20261002_008_shopping_purchases`:
  - new `app.shopping_purchases` and `app.shopping_allocations` tables;
  - a `(household_id, id)` unique key on `meal_order_items` for the composite foreign key;
  - widened `audit_events` checks for `shopping_purchase` `check`/`undo`.

  No existing row is changed. The readiness check now also requires `recipe_categories` and `shopping_purchases`.

- `GET …/shopping` adds a `checklist`: per ingredient/form/unit-family line, what is still to buy, what is already bought, the covering purchases and a token. New routes: `POST …/shopping/purchases` (409 `shopping_changed` for a stale token), `POST …/shopping/purchases/:id/undo` and `GET …/shopping/purchases` (latest 100).
- Shopping page: the combined view becomes a shared checklist. Unchecked lines come first with "Already bought …; this is the rest" notes; checked lines follow under "Bought" with who bought them and when. Unchecking undoes the purchase. A History view lists purchases, including undone ones. The by-day view is unchanged. Both languages are covered.

## Acceptance evidence

| Criterion (proposal §4)                                       | Evidence                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared checks; checked lines move below                       | Browser: a member checks Egg and it moves under Bought with "Bought by …"; the owner sees it checked                                                                                                               |
| Egg example: only added demand returns; history keeps first 2 | Integration and browser: a second order shows "2 whole … Already bought 2 whole"; history lists 2 eggs by the buyer                                                                                                |
| Servings changes                                              | Raising the first order to 3 servings adds only the difference (to buy 6 with both orders)                                                                                                                         |
| Completing or cancelling changes demand, not history          | Completing order A leaves only B's 2 eggs and no bought amount; cancelling B empties the list; history unchanged                                                                                                   |
| A closed order's purchase does not cover a later order        | Pure and API tests: allocations to non-pending items are ignored                                                                                                                                                   |
| Units and forms stay separate                                 | Pure test: whole, grams, "to taste" and "boiled" eggs give four lines                                                                                                                                              |
| Concurrent members consistent; stale checks refused           | Two simultaneous checks record one purchase (201 + 409 `shopping_changed`); a retried request id returns the first purchase; an order change makes the old token stale; browser shows the alert and refreshed list |
| Undo / uncheck, append-only record                            | Undo reopens the line once (idempotent); history marks it undone; `audit_events` holds `check` then `undo`                                                                                                         |
| Scope                                                         | A check for tomorrow's range covers only tomorrow; the full list still shows the later meal                                                                                                                        |
| Removed dishes                                                | The allocation is deleted with the item; the purchase stays in history; a re-added dish is to buy again                                                                                                            |
| By-day view still describes the same demand                   | `grouped` and `combined` are identical before and after a check                                                                                                                                                    |
| Exact arithmetic                                              | 1/3 g covered exactly reaches zero, with no rounding leftover                                                                                                                                                      |
| Household isolation                                           | Another household gets 404 on list, history, check and undo, including a foreign purchase id through its own route; removed members get 404                                                                        |

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database (migration 008 applied by the test harness):

- Full `npm run check`: format, lint, typechecks, production builds, 83/83 integration tests and 76/76 desktop/mobile browser cases passed.
- OpenAPI regenerated.
- Two UI issues found by the new browser tests were fixed before the final run:
  - the checkbox now shows the member's choice while it is being saved;
  - a refused check's alert stays visible while the list refreshes.
- The agent reviewed a mobile screenshot of the checklist with partly bought lines.

## Not verified

- Migration 008 has not been applied to the development database or staging; record its result with the next deployment.
- The interleaving of an order edit with a check is handled by the token and the foreign-key-to-409 mapping. It was reasoned from PostgreSQL semantics and is not forced in a test.
- No real-phone review by the owner.
