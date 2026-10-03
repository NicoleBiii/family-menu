# ADR 0009 — Shared shopping checks, reconciliation and purchase history

Date: 2026-10-02. Status: **accepted by the owner on 2026-10-02** with the recommended answers below; implemented on `claude/ux-002-shopping-design` (UX-002 phase 4). Source: the owner-approved [UI expansion proposal](../proposals/2026-10-01-ui-expansion.md) §4, which asks for this focused data-model decision before rollout. It extends [ADR 0005](0005-shopping-list.md) and supersedes its "purchase checkboxes deferred" limit for this scope.

## Owner-confirmed requirements (proposal §4 and 2026-10-01 discussion)

1. Household members share shopping checks.
2. Checked lines move below unchecked lines; history records the purchased ingredient, quantity, actor and time; undo/uncheck is available on the active list.
3. When demand grows after a purchase, only the additional amount returns to the list. Example: 2 eggs needed and bought, then another order adds 2 → 2 eggs to buy, while history keeps the first 2.
4. Cancelling or completing an order changes current demand without erasing history.
5. A purchase made for a closed order does not cover a later, independent order.
6. Different units or forms never merge silently. Concurrent members see a consistent result after refresh.
7. Purchases are **not** pantry inventory. A checkbox never overwrites order demand. Check and undo are kept as an append-only record.

## Proposed model

### What a checkbox is attached to

A **shopping line** is one ingredient (normalized `ingredient_key`), one normalized form, and one unit family from ADR 0005. The families are metric mass, imperial mass, metric volume, spoon/cup volume, each count unit, whole items, or **unquantified** ("to taste"). Today's combined list can show "500 g" and "2 whole" on one ingredient row; under this design they are two checkable lines, so incompatible amounts are never bought or reconciled together. The line id is derived from those three parts, so it is stable while the demand changes.

### Purchases are allocated to the order items they cover

Demand already comes from immutable order-item snapshots (ADR 0004/0005). When a member checks a line, the server records a **purchase** and its **allocations**: the exact amount of that line it covered for each pending order item in scope.

- `app.shopping_purchases`: one row per check, with the household, line identity (`ingredient_key`, normalized form, family), display name/form, total bought quantity as an exact rational in the family's base unit (null for unquantified), the client `request_id` (unique per household, so a double tap records one purchase), `created_by`, `created_at`, and once-only `undone_by`/`undone_at`.
- `app.shopping_allocations`: `(purchase_id, order_item_id)`, the covered quantity as an exact rational (null for unquantified), and composite household foreign keys to the purchase and the order item. An allocation is deleted with its order item, which happens when a dish is removed from a pending order. The purchase row and its history entry remain.
- Quantities are stored as positive `bigint` numerator/denominator pairs, not `numeric`. Scaling servings can produce non-terminating values such as 1/3 g. Remaining amounts must reach exactly zero, using the same rational arithmetic as ADR 0005.
- Check and undo also append to the existing `app.audit_events`. Its `entity_type` and `action` checks are widened by an additive migration to allow `shopping_purchase` with `check`/`undo`. That table is the append-only record; `undone_at` is derived state that is set once.

### How the list is computed

For each pending order item in the requested scope and each line it contributes to:

- `required` = snapshot quantity × ordered servings ÷ recipe servings, as today. Repeated lines within one dish are summed.
- `covered` = the sum of that item's allocations from purchases of this line that have not been undone.
- `remaining` = max(0, required − covered).

The line's **to buy** amount is Σ remaining, shown rounded up with ≈ as today. Its **bought** amount is Σ min(covered, required). A line with nothing remaining moves to the checked section, together with who bought it and when. A line that is partly covered stays unchecked and shows "already bought …".

This gives the confirmed behaviour without special cases:

| Situation                                         | Result                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 2 eggs (order A) bought; order B adds 2 eggs      | A: required 2, covered 2. B: required 2, covered 0. **To buy 2**, bought 2; history keeps 2. |
| Order A's servings raised from 2 to 3 eggs        | Same item, covered 2 → **to buy 1**                                                          |
| Order A completed or cancelled                    | A leaves pending demand; only B counts. History still shows the purchase.                    |
| A dish is removed from A and re-added             | The new item has no allocation, so it appears again (conservative)                           |
| Order A reduced from 4 to 2 eggs after buying 4   | A is fully covered; the spare 2 do **not** cover order B (not pantry, never under-buy)       |
| "Salt, to taste" bought, then a new dish needs it | The new item is uncovered, so the line reappears unchecked                                   |
| 500 g eggs and 2 whole eggs                       | Two lines, checked separately                                                                |

### Checking, undoing and concurrency

- **Check.** `POST /households/:id/shopping/purchases` takes `{ requestId, lineId, token, from?, to? }`. In one transaction under a household-scoped advisory lock, the server recomputes the line for the same scope. It allocates each item's current `remaining` and records the total as the bought quantity. Checking means "I bought what the list showed": partial amounts are not entered in this phase.
- **Stale views.** Each line in `GET …/shopping` carries a `token`, a digest of its per-item remaining amounts. If the list changed since the member loaded it (another member checked it, or an order changed), the token no longer matches. The server then returns 409 `shopping_changed` and records nothing, and the page refreshes. Two members checking the same line at once therefore record one purchase.
- **Scope.** A check under a date range covers only the meals in that range. Meals outside it stay to buy.
- **Undo.** `POST …/shopping/purchases/:purchaseId/undo` voids the whole purchase once (idempotent) and appends an audit event. Unchecking a line in the UI voids the purchases that cover it. Undone purchases stay in history, marked as undone.
- **History.** `GET …/shopping/purchases` returns the household's latest 100 purchases with line name, form, quantity (presented as in ADR 0005), actor, time and undo state, newest first.
- **By-day view.** It continues to show the full demand of each meal, so it still matches the orders (AC-10). Checks affect the combined list only.
- **Permissions.** Every active member may check, undo and read history (shared-household rule). Every route uses the existing membership check, and other households get 404. Allocations can reference only the household's own order items, which the composite keys enforce.

## Amendment — per-dish checks in the by-day view (UX-003, 2026-10-02)

The owner-confirmed [home-ordering proposal](../proposals/2026-10-02-home-ordering.md) replaces the "checks affect the combined list only" rule above. The by-day view now gives each dish its own checkable task per ingredient. This uses the existing model without a migration, because allocations are already per order item:

- **Task.** One order item's share of one shopping line: same ingredient, form and unit family. Repeated lines within one dish add up into one task. Each by-day dish lists its tasks in its own ingredient order, with its full demand (`required`), what is still `toBuy`, what was `bought`, the purchases covering it, and its own `token`. The by-day view keeps `ingredients` unchanged. Amounts in tasks use the shopping presentation, e.g. 0.2 kg is shown as 200 g.
- **Check.** `POST …/shopping/purchases` accepts an optional `orderItemId`. With it, the server checks the task's token and allocates only that item's remaining share. The purchase records that amount. The household lock, request-id idempotency, scope and 409 `shopping_changed` all work as before. A dish that is not pending, not in scope, not in the household or without the line is a 409, and a malformed id is a 400.
- **Consistency.** The combined line, by-day tasks and history all derive from the same allocations. A per-dish check lowers the combined line's to-buy amount by exactly that dish's share; a combined check marks every covered dish bought.
- **Undo.** Unchecking a task voids the purchases covering it. When one of them also covered other dishes (a combined check), the task reports `shared: true`, and the UI asks before reopening all of them together. Undoing a per-dish purchase reopens only that dish.

Tests: pure task reconciliation, real-database per-dish check/undo/stale/scope/household cases, and the shared-undo case. A two-member browser case covers per-dish checks, the warning and Chinese labels.

## Alternatives considered

- **Running totals per ingredient** ("bought 2 eggs" counted against all demand). Simpler, but a purchase for a closed order would cover a later order, and an order edit could not be told apart from new demand. This contradicts requirements 3–5.
- **Copying purchases into order snapshots.** It would mutate demand records and break the append-only rule (requirement 7).
- **Pantry stock that carries spare amounts.** Out of scope; the proposal keeps purchases separate from inventory.

## Owner answers (2026-10-02)

1. **Partial purchases:** not in this phase. A check means "bought what the list showed"; later growth in demand returns automatically.
2. **Spare amounts:** an order that shrinks after buying does not pass its spare amount to other orders.
3. **History length:** the latest 100 purchases.

## Implementation and verification plan

Add an additive migration 008 (two tables, indexes and the widened audit checks), a pure reconciliation function next to `buildShoppingList` with exact-rational unit tests, the API routes, and the Shopping UI (unchecked first, checked below, "already bought" notes, a History view, undo) in both languages. Real-database tests should cover:

- the egg example;
- servings changes;
- completion and cancellation;
- removed and re-added dishes;
- unit and form separation;
- token conflicts, and concurrent checks recording one purchase;
- scope;
- undo;
- 404 for other households and removed members;
- order snapshots and the by-day view unchanged.

Browser tests should cover the shared list for two members and both locales.
