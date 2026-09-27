# ADR 0004 — Meal orders, local-time scheduling and snapshots

Date: 2026-09-26. Status: implemented and locally verified (ORD-001).

## Decisions

- **Order record.** `app.meal_orders` stores status (`pending`, `completed`, `cancelled`), the meal instant (`scheduled_at`), the household-local `meal_date`/`meal_time` it was planned with, the household time zone at that moment, notes (≤ 1000), `revision`, creator/updater, and `closed_at`/`closed_by` for terminal states. Grouping by day uses the stored local date, so history keeps the day a meal was planned for even if the household time zone later changes.
- **Local time is resolved explicitly.** Clients send `{type:'now'}` or `{type:'scheduled', date, time}` in household time. The API resolves it with `Intl` (Node 24 has no `Temporal`; no new dependency): a local time skipped by a daylight-saving jump is rejected (`code: nonexistent_time`); a repeated one is rejected with both options and their UTC offsets (`code: ambiguous_time`) until the client sends `disambiguation: earlier|later`. Nothing is shifted silently. Dates must be within a year of today.
- **Snapshots.** Each `app.meal_order_items` row copies the recipe's name, base servings, price points, steps, ingredient lines (with normalized key and exact decimal quantity, as JSON) and revision when the dish is added. Recipe edits and archiving never touch items (AC-11). When an order is edited, kept items (referenced by `itemId`) change only servings and position; newly added dishes take a fresh snapshot. Archived recipes cannot be newly ordered (409); items reference recipes with a household-composite foreign key, and an ordered recipe cannot be deleted.
- **Shared editing and conflicts.** Every current member may create, edit, complete or cancel any pending order (confirmed rule). Writes lock the caller's membership (`FOR SHARE`) and the order row (`FOR UPDATE`) and require `expectedRevision`; a stale write gets 409 (AC-04). Completed and cancelled orders are read-only.
- **Idempotency.** Creation uses a client `requestId` (`unique (household_id, create_request_id)`), as for recipes. Completing or cancelling an order that is already in that state returns it unchanged with no second audit event, so double taps and two members acting at once have no duplicate effect (AC-07). The opposite terminal transition is a 409.
- **Audit.** `app.audit_events` records actor, entity, action (`create`, `update`, `complete`, `cancel`) and resulting revision for every order mutation. It is a minimal trail, not event sourcing.
- **Points.** `totalPoints` = Σ snapshot price × servings, display-only.
- **Limits.** 20 dishes per order, 200 pending orders per household, history lists the latest 100 closed orders (no pagination yet).
- **UI.** The Meals page lists upcoming orders grouped by household-local day (Today/Tomorrow/date) with an overdue marker, and a History view. Orders start from "New meal order" or "Order" in a recipe's dialog. The editor offers "As soon as possible" or a date/time in the household zone, asks which occurrence is meant for repeated times, and offers "Load the latest version" on a conflict. Pages refresh when the browser tab becomes visible again; real-time updates remain deferred.

## Consequences and limits

- AC-03, AC-04, AC-07, AC-08 and AC-11 have integration tests (plus browser flows for ordering, editing, completion, cancellation, DST choice and conflict). AC-02 now also covers orders.
- SHOP-001 can read pending order snapshots directly: ingredient lines carry `key`, exact `quantity`, `unit` and `form`; required quantity = snapshot quantity × servings ÷ `recipe_servings`.
- Reopening closed orders, recurrence, per-item notes and history pagination are not implemented.
- The history index orders by `closed_at`; the history view groups by meal date in that order, so days can repeat when meals were closed out of order.
