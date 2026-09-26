# MVP Specification — Family Menu

Version: 0.1. Date: 2026-09-25. Status: owner-confirmed feature scope with explicitly labeled design defaults.

## Product outcome

A household can build an editable menu quickly, collaboratively order meals for now or later, see the ingredients it needs, and complete orders into history. Presets and limited text AI reduce initial recipe-entry effort.

## Confirmed release boundary

| Capability        | First release                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Accounts          | Basic sign-in, with Google as the proposed first provider                                       |
| Households        | Create/join a household and manage membership                                                   |
| Shared menu       | Every household member can add and edit dishes and recipes                                      |
| Dish data         | Name, virtual price, image, method, ingredients; serving yield added to make scaling meaningful |
| Recipe onboarding | Curated presets, manual input, quota-limited text AI drafts                                     |
| Generated content | Preview, edit, explicitly save, or discard before it becomes a household recipe                 |
| Meal orders       | Multiple dishes, immediate or scheduled use, notes, editable after submission                   |
| Collaboration     | Every active member can edit other members' pending orders                                      |
| Shopping          | Combined pending-order ingredients and grouped day/dish views                                   |
| Completion        | Manually complete orders; view history                                                          |

Deferred by owner confirmation: virtual balances and allocations, paid memberships and billing, Instagram/YouTube or arbitrary-link import, grocery app checkout, post-meal photos. Also defer generated images, native mobile apps, offline writes, push notifications, advanced role configuration, pantry inventory, nutrition tracking, and recurrence unless a later scope decision adds them.

Virtual menu prices are playful points with no cash value, purchase, redemption, balance enforcement, or payment integration. Real paid membership, if later introduced, is a separate system from these points.

## Working defaults

These fill implementation gaps; they are recommendations, not additional statements made by the owner.

- Mobile-first English UI; recipe titles, instructions, and notes accept Unicode, including Chinese.
- Each order has one requested meal date/time and multiple items. Any member can create multiple orders, including several on the same date. No weekly recurrence in v1.
- Household timezone defaults to America/Toronto and is shown when scheduling. Store timestamps with timezone-aware semantics and retain the household's IANA timezone for grouping. Handle ambiguous or nonexistent local times explicitly.
- All active members can create, read, edit, cancel, or complete pending household orders. Completed and cancelled orders are read-only in v1. Reopening is deferred.
- A household owner manages invitations and member removal. Ordinary members still have equal menu/order editing rights. Use revocable, expiring invitation links without an email-sending subsystem initially.
- Model membership as user-to-household relations; a minimal household selector can support switching. Business records always belong to exactly one household.
- One optional image per dish. Target a small curated seed collection (approximately 12 recipes), with owned or appropriately licensed images and a provenance manifest. Missing images use honest placeholders, not unrelated photographs.
- No persistent “already purchased” checkboxes in v1: a live demand calculation is simpler to keep correct after order edits. Add purchase tracking only with defined reconciliation behavior.
- Start with an invite-only beta, roughly 5–10 households. This is a capacity-planning assumption, not observed demand.

## Recipe and order semantics

A recipe specifies a base serving yield and structured ingredient lines. A line records ingredient identity, display name, quantity when known, unit, preparation/form, and an optional note. Keep “to taste” or unknown quantities as text; never invent a numeric amount.

Order items request a number of servings. For measured ingredients:

`required quantity = recipe ingredient quantity × requested servings / recipe base servings`

Use decimal arithmetic. A virtual price is a nonnegative integer number of points per serving in the proposed v1 model; label it consistently. It is display-only, including on orders.

On order creation, store a snapshot of each selected recipe's name, ingredients, method, base yield, and virtual price. Menu edits do not silently change existing orders or history. Editing an existing item's serving count uses its snapshot; replacing an item explicitly takes a fresh snapshot. Archiving a menu dish removes it from new ordering without breaking existing orders.

Order updates, status changes, and revision increments must be atomic. Every mutation carries an expected revision; if another member has updated the order, return a conflict and let the user refresh/reapply their change. Do not silently overwrite the latest version.

Use idempotency keys for order creation and AI generation. Record created_by, updated_by, timestamps, revision, and a minimal mutation audit event. An audit event is not a full event-sourcing architecture.

## Shopping-list calculation

- Select orders from the current household with status PENDING. Include overdue pending orders unless the user deliberately filters by date.
- Offer “All pending” as the default calculation scope; a date range is optional. Both views must use exactly the same selected orders.
- Combined view aggregates compatible ingredient lines across all selected items.
- Grouped view groups by household-local meal date, then order/dish, with a drill-down to source demand.
- Sum by normalized ingredient identity, compatible measurement dimension, and relevant form. Convert known fixed units such as kg ↔ g or L ↔ mL.
- Do not infer density, substitute ingredients, merge raw and cooked rice, or automatically convert “1 onion” into grams. Preserve incompatible or unknown quantities separately and label them.
- Calculate shopping quantities deterministically from confirmed order data. AI is not involved in arithmetic or authorization.
- Recompute after edits, cancellations, or completion. Fetch a consistent database snapshot so totals and grouped rows cannot represent different order revisions. Include a generated-at indicator and refresh on returning to the page; real-time collaborative subscriptions are deferred.

Example fixture: a two-serving recipe contains 200 g chicken. Ordering three servings requires 300 g. Another order requires 0.2 kg of the same chicken form: combined demand is 500 g. A demand for two whole chicken breasts remains a separate count line unless a verified conversion exists.

## AI draft workflow

Input: dish name and optional cooking preferences, with explicit input-size limits. Output: a structured draft containing title, yield, ingredients, and steps. Price and image remain user-selected; do not invent a photograph.

1. Authenticate the member and verify household membership.
2. Reserve user/household quota and worst-case permitted provider cost atomically before dispatch.
3. Call an external text model with a bounded output and timeout. Track a durable request record; polling can retrieve its state.
4. Validate response structure, sizes, quantities, and units. Treat generated text as untrusted data, never executable code or instructions for tools.
5. Present an editable draft. The user explicitly saves it into the household menu or discards it.
6. On save, recheck membership and validate the final user-edited data. Saving twice must not create duplicate recipes.

Keep provider charges separate from user-facing quota: a failed or discarded draft can still incur provider cost. A timed-out call may have an uncertain billing outcome; retain its cost reservation conservatively and do not retry it blindly. A killed application must leave a recoverable/failed request state, not an indefinitely spinning screen. Manual entry and presets remain available when AI is disabled.

Choose the provider/model only after a small recipe-quality, latency, schema-validity, and cost evaluation. Do not promise dietary suitability or allergen safety from model output. Avoid sending account identifiers or unrelated household information to the model.

## Mobile screens

1. Sign in / create or join household.
2. Menu: browse, search, choose servings, start an order.
3. Recipe editor: manual, preset, or AI-draft source; editable preview and save/discard.
4. Meal orders: pending list by day, editable details, complete/cancel.
5. Shopping: combined and grouped views with the same scope.
6. History and basic household settings.

Use a compact bottom navigation for Menu, Orders, Shopping, and Household; history can sit under Orders. Cover loading, empty, validation, permission, conflict, and provider-failure states. Test keyboard access, labels, focus, and touch controls as well as narrow screens.

## Acceptance and verification matrix

| ID    | Observable behavior                                                                                                                             | Verification                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| AC-01 | A user can sign in with the configured provider, create a household, and join via a valid invite; expired/revoked invites fail                  | Integration plus real-provider staging smoke test         |
| AC-02 | A member of household A cannot read/change household B's recipes, orders, AI drafts, invites, or private images, even with a valid B identifier | API integration tests with two households                 |
| AC-03 | Any active member can edit another member's pending order; removed members lose access                                                          | Authorization integration tests                           |
| AC-04 | Two members editing revision 1 cannot silently overwrite each other: one update succeeds and the stale update receives a conflict               | Real-database concurrency test plus conflict UI check     |
| AC-05 | Manual and preset recipes can be edited and saved; preset source records remain unchanged                                                       | Integration and browser flow                              |
| AC-06 | AI output remains a draft until explicitly saved; discard causes no menu change; duplicate save is idempotent                                   | Mock-provider integration and limited real-provider smoke |
| AC-07 | Duplicate order submission creates exactly one order; cancelling or completing twice causes no duplicate effect                                 | Idempotency and transaction tests                         |
| AC-08 | A scheduled order appears under the correct household-local date; invalid/ambiguous local times receive explicit treatment                      | Timezone boundary fixtures and mobile check               |
| AC-09 | The chicken fixture yields 500 g; incompatible count/weight and unquantified lines are not falsely merged                                       | Deterministic unit and integration tests                  |
| AC-10 | Both shopping views derive the same demand; editing, cancelling, or completing an order changes pending totals correctly                        | API integration plus browser flow                         |
| AC-11 | Editing/archiving a recipe cannot rewrite an existing order's snapshot or completed history                                                     | Data-integrity integration tests                          |
| AC-12 | Oversized, unsupported, or cross-household image operations fail; valid images can be viewed only under the intended policy                     | Upload and storage-access integration tests               |
| AC-13 | Concurrent AI requests cannot exceed configured reservations; exhausted/disabled AI leaves manual entry operational                             | Quota-concurrency and dependency-failure tests            |
| AC-14 | A user can complete the core workflow at a 360 px viewport and with keyboard navigation without hidden required controls                        | Browser automation and manual accessibility checks        |
| AC-15 | Staging and production are isolated; release identity, smoke result, alert delivery, and database/file restore evidence are recorded            | Release checklist and recovery drill                      |

## Definition of release-ready

Applicable AC-01–AC-15 checks pass, with evidence. No known unresolved cross-household access or silent data-loss defect is accepted. A real phone test, provider failure test, and restoration into an isolated environment are recorded. Limitations and beta support hours are visible. This does not constitute a security certification or guaranteed availability.
