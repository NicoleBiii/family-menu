# ADR 0008 — Meals dish browser and single-submit order basket

Date: 2026-10-02. Status: implemented on `claude/ux-002-basket` (UX-002 phase 3). Source: the owner-approved [UI expansion proposal](../proposals/2026-10-01-ui-expansion.md) §2.

## Decisions

- **No API or schema change.** The basket is browser state only. Placing it calls the existing `POST /households/:id/orders` with all its dishes. ORD-001's validation, snapshots, audit event, idempotency and permissions (ADR 0004) therefore apply unchanged, and no server order exists before the member places one.
- **Session storage, per household.** The unsent basket is kept in `sessionStorage` under one key per household. It holds dishes and servings, notes, now/later timing and a request id. It survives page changes, language switches and reloads in the same tab. It is not shared with other members or devices, and switching household shows that household's own basket. Malformed or unavailable storage gives an empty basket. Sign-out removes all stored baskets so the next person on the device starts empty.
- **One request id per basket.** The basket keeps its request id until the order is placed or the basket is emptied. A double tap or a retried submission after a network failure therefore returns the first order instead of creating a second one. Consequence: if a submission succeeded but its response was lost, and the member then changes the basket and retries, the server returns the first order as it was saved. The member sees that order in Upcoming and can edit it.
- **Adding dishes.** The first Add uses the recipe's base servings. Each further Add (the "+" control) adds one serving, and "−" removes one. At zero the dish leaves the basket. Dishes are unique by recipe, with at most 20 per basket (the order limit) and 1–100 servings each.
- **Meals opens on the dish browser.** It shows active household dishes grouped by category (ADR 0007), with search and category filters. A summary bar shows the dish count, servings and virtual points, with Review basket and Empty basket actions. Upcoming and History remain one tap away. The Menu dialog's action becomes "Add to basket": it adds the dish and opens Meals with a confirmation.
- **Review uses the order editor.** "Review basket" opens the existing order form in a basket mode. Each dish row shows its name, servings and a remove control, followed by now/later timing (with the existing daylight-saving disambiguation) and notes. Edits are written back to the basket, so "Add more dishes" loses nothing. Place order is disabled when the basket is empty. A successful order empties the basket and shows Upcoming.
- **Archived dishes.** When the Meals page loads, dishes that are no longer active are removed from the basket with a notice. The server would reject them anyway.
- **Editing pending orders is unchanged.** Any active member can still edit any pending order, including adding dishes from the active menu, with the same revision conflict handling.

## Consequences and limits

- A basket is personal to one browser tab session; two members cannot build one basket together. The order they place is still shared and editable by all members.
- The old single-dish "New meal order" form was replaced by the basket. The order editor keeps only basket and edit modes.
- Household isolation of the stored basket is by storage key and was reasoned from the code. No browser test switches households.
