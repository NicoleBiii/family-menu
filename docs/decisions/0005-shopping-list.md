# ADR 0005 — Shopping list calculation

Date: 2026-09-26. Status: implemented and locally verified (SHOP-001).

## Decisions

- **Source of truth.** Demand comes only from pending order snapshots (`meal_order_items.ingredients`), never from live recipes. Default scope is all pending orders, overdue ones included; an optional inclusive `from`/`to` range filters by household-local meal date.
- **One read, two views.** `GET /api/households/:id/shopping` reads all rows in one SQL statement (one database snapshot, whose `now()` is the `generatedAt`) and builds both the combined list and the by-day view from those rows in the same response. The views therefore cannot describe different order revisions (AC-10).
- **Exact arithmetic.** Required quantity = snapshot quantity × ordered servings ÷ recipe base servings, computed as exact rationals with BigInt. Results are shown with at most three decimals; a value that cannot be written exactly is rounded **up** and flagged `approximate` (shown with ≈), so the list never under-states what to buy.
- **Grouping.** Lines are combined by normalized ingredient key and normalized form; different forms (raw vs cooked) stay separate lines. Within a line, amounts are summed per unit family:
  - metric mass g/kg; metric volume ml/l;
  - imperial mass oz/lb;
  - spoon/cup volume tsp/tbsp/cup (1 tbsp = 3 tsp, 1 cup = 48 tsp);
  - each count unit (piece, clove, slice, can, bunch, pinch) and unit-less whole items separately.
    No conversion crosses families: no density, no metric↔imperial, no cup↔ml (US and metric cups differ), no count↔mass. Incompatible amounts appear side by side on the same ingredient line (e.g. "500 g" and "2 whole").
- **Display unit.** Each family total is shown in the largest unit that gives a value ≥ 1 with an exact ≤ 3-decimal result (1500 g → 1.5 kg; 72 tsp → 1.5 cup; 50 tsp stays tsp).
- **Unquantified lines** ("to taste", blank amounts) are listed with their notes and never given a number.
- **Freshness.** The page recalculates on load, on the refresh button and when the browser tab becomes visible again; there are no real-time subscriptions (deferred by MVP_SPEC).

## Consequences and limits

- AC-09 (chicken fixture = 500 g; counts and unquantified lines separate) and AC-10 (same demand in both views; edits, cancellation and completion change totals) are covered by pure-calculation tests, API tests and a browser flow.
- Purchase checkboxes and pantry tracking remain deferred (LATER-007).
- Spoon totals that are not whole tablespoons stay in teaspoons (e.g. 23 tsp); mixed-unit display ("7 tbsp 2 tsp") is not implemented.
- The ingredient key is a normalized name, so "chicken breast" and "chicken breasts" are different ingredients. Synonym handling is not implemented.
