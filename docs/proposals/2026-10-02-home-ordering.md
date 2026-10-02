# Home, ordering and shopping view revision — 2026-10-02

Status: owner direction confirmed in conversation on 2026-10-02. This supersedes the UX-002 proposal's choice to keep Menu as a primary tab and Meals as the dish browser. It does not change the order or shopping data rules.

## Owner-confirmed direction

- The household menu becomes the home page, outside the bottom tab navigation. The home page links to a separate page for editing recipes and the menu. Recipe management is less frequent than ordering.
- Scrolling down the home page reaches dish ordering. The desktop and tablet layout takes its cues from Uber Eats restaurant menus; the phone layout takes its cues from Ele.me and Meituan food ordering: a category rail on the left, dish list beside it, and a visible floating basket count. Use these as interaction references, not their branding, images, delivery, pricing or payment features.
- Opening the basket goes to a **separate order confirmation page**. Members can change dishes/servings, add notes, choose now or later, then place one order.
- The existing Orders tab shows only pending and historical orders, including shared pending-order editing. It no longer has a dish-browsing tab.
- The Shopping view grouped by date, order and dish gives each ingredient its own checkable task. Checking one dish's ingredient updates the same household purchase history and combined progress; the other dishes' shares remain independently manageable.
- The owner has not chosen additional home modules. Keep the home focused on menu and ordering until they do.

## Implementation defaults

- Keep `/` as Home, introduce `/recipes` for management and `/checkout` for confirmation, and keep `/meals` for order records to preserve existing links. The brand links to Home; the bottom navigation contains Orders, Shopping and Household.
- Show the existing home introduction with a prominent Manage recipes button, then the categorized dish browser. Use household photos where present and placeholders where absent. Keep virtual points visibly non-monetary.
- Keep the unsent basket per household in the current browser session. Going back from confirmation preserves its contents. Successful submission clears it and opens pending orders.
- Preserve signed-out starter-recipe access through the Recipes link. Do not invent delivery, ratings, discounts, payment or restaurant reviews.
- In grouped shopping, a task is one ingredient identity/form/unit family for one order item, so duplicate ingredient lines within the same dish add together. A check allocates only that item's outstanding share. The combined list and history derive from the same purchase allocations. Undoing a grouped check affects only that purchase. An existing combined check may cover several items; grouped rows should reflect that coverage, and undoing a combined check can reopen those items together.

## Owner review amendment — 2026-10-02

After reviewing the first implementation on staging, the owner found that reaching Home only through the brand was not humane, and that recipe management lacked a way back and was not prominent enough. Supersedes the defaults above that the bottom navigation holds only Orders, Shopping and Household:

- The bottom navigation holds Menu (点菜), Orders, Shopping and Household. The Menu tab opens Home at the dish browser; the brand still opens the top of Home. The Menu tab stays marked on `/recipes` and `/checkout`.
- `/recipes` starts with a Back control that returns to the previous in-app page, or to ordering when opened directly.
- The Home entry to recipe management is a filled, full-width-on-phone button with a short description.

## Observable acceptance criteria

1. On desktop, tablet and 360 px phone, Home is reachable outside the bottom tabs. Home shows the household menu and the ordering section directly below the introduction, with a clear route to `/recipes`. Recipe create/edit/archive, presets, category management and AI drafts still work there.
2. The order browser has a left category rail that jumps to sections, dish details with image/name/points, add and serving controls, and a basket summary with a distinct item count. The controls remain keyboard and screen-reader accessible.
3. Basket review opens `/checkout`. The member can change the order and notes, schedule it and submit once; going back preserves an unsent basket. The `/meals` page has only Pending and History views, while all active household members can still edit each other's pending orders.
4. Grouped Shopping shows a checkable row for every ingredient of each dish. Checking one row changes combined remaining demand and purchase history, preserves another dish's share and can be undone. Date filtering, stale tokens, concurrent members, unknown quantities and incompatible units continue to behave safely.
5. English and Simplified Chinese labels, mobile/keyboard paths and the affected order/shopping regressions pass. No new payment or delivery behavior appears.

Implement the page/ordering revision and grouped shopping checks in separate, reviewable PRs. Reassess the release target after both pass staging and owner phone review.
