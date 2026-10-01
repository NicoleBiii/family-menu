# UI Expansion Proposal — 2026-10-01

Status: **proposed for owner approval**. This document does not authorize implementation or change the confirmed MVP specification. The owner asked to discuss significant changes before they are processed. No feature code or database migration belongs to this design task.

## Context and owner-confirmed direction

The owner passed the six-step Railway staging smoke using desktop Chrome and Chrome on an iPhone 18 Pro Max, then proposed nine improvements. They confirmed these design choices in the discussion:

1. A dish is added to a shared order basket; one final action submits the whole order.
2. Shopping checks are shared by household members. Increased demand returns the extra amount to the pending list.
3. The first image option is a free photo-library chooser, not automatic image generation.
4. The first translation phase covers interface text, prompts and date/number presentation; recipe text and member-authored content stay in their original language.
5. A household recipe has one primary category.
6. An invitation preview is generic and does not disclose the household name.
7. Keep Menu for recipe management and use Meals as the categorized browsing and basket entry point.
8. Shopping history records the purchased ingredient, quantity and time. Increased demand shows only the remaining amount to buy.

These are direction decisions, not approval of the full implementation plan below. The current [MVP specification](../MVP_SPEC.md) defers purchase checkboxes and generated images. Approval would add purchase tracking to scope; generated images remain deferred.

## Proposed user experience and acceptance criteria

### 1. English and Simplified Chinese

Put a visible `中 / EN` control in the header, available before and after sign-in. Use the browser language on first visit, then remember an explicit choice on that device. Translate navigation, forms, errors, dates, numbers and accessible labels. Preserve recipe titles, ingredients, instructions and household/member names as written.

Acceptance: switching language keeps an in-progress basket or form; refresh keeps the explicit choice; sign-in and join work in both languages; `html lang`, error messages and date formatting follow the selected locale.

### 2. Meals browsing and order basket

Keep Menu for recipe management. Meals opens a categorized, searchable dish list with an Add action and a visible basket summary. Repeated adds increase that dish's servings in the basket. Keep the unsent basket for the current browser session and isolate it by household; no server order exists until confirmation. The member reviews items, servings, optional notes and now/later scheduling before one Place order action. Existing pending-order editing and history remain accessible.

Acceptance: one submission creates exactly one order with the chosen dish snapshots; closing the basket creates none; a stale edit still shows a conflict; active members keep permission to edit one another's pending orders.

### 3. Household categories and AI suggestions

Each household owns its categories, and a recipe has one primary category. Make the new recipe category ID nullable during migration; existing recipes display Uncategorised until assigned. A new recipe can explicitly choose Uncategorised if no category fits. Members can add and rename categories. Deleting one requires reassignment or clearing its recipes. Presets carry a suggested category when copied but never create a household category silently.

Include only bounded category names/IDs in the existing AI draft call. AI may suggest an existing category or a new name. On draft review, the member accepts an existing category, explicitly creates the proposed one, or chooses another before saving. Validate every suggestion against the active household.

Acceptance: category changes leave order snapshots intact; cross-household IDs fail; renaming preserves recipe links; rejected AI suggestions create nothing; existing AI quotas still apply and the cost reservation covers the extra category context.

### 4. Shared shopping checks and purchase history

Put a checkbox on each compatible ingredient/form line of the combined pending-demand list. Checked lines move below unchecked lines. Save household purchase events with the actor, time, source demand and bought quantities. Show a history view and allow undo/uncheck on the active list. The by-day view still describes the same order demand.

Acceptance: if 2 eggs are needed and bought, then another order adds 2, show 2 eggs still to buy while history retains the first 2. Cancelling or completing an order changes current demand without erasing history. A purchase for a closed order does not cover a later independent order. Different units/forms do not silently merge; concurrent members get a consistent result after refresh.

### 5. Photo upload

Add a bounded drag-and-drop target to the desktop recipe photo area while retaining the file picker and keyboard path. Give the phone photo button a visible label and larger touch target. Reuse current image preparation, type and size rules.

Acceptance: dropping and choosing the same valid file have the same result; invalid files show the existing clear error; the phone control stays usable at 200% zoom.

### 6. Sign-out confirmation

Show an accessible confirmation dialog before logout. Cancel returns focus to Sign out; confirm closes the session once.

Acceptance: cancel leaves the session active; keyboard and screen-reader users can understand and dismiss the dialog.

### 7. Browser icon and branding

Derive a vector favicon and Apple touch icon from the existing pot mark. Use a separate graphical image for link previews, without a third-party photograph as the logo.

Acceptance: the favicon appears in supported browser tabs, and the touch icon displays when saved to an iPhone home screen.

### 8. Invitation preview

Serve a generic Open Graph title, description and graphical image directly in the `/join` HTML response. Do not require JavaScript or sign-in to see metadata. Keep the single-use token in the URL fragment. Do not expose a household name, token or member information.

Acceptance: a fresh invite shows a generic branded preview when iMessage fetches metadata; it still opens the correct join flow; preview fetching cannot consume or reveal the token. Platform rendering and caching can vary.

### 9. Free-library photo chooser

The member explicitly searches a free photo library from the recipe editor, previews results and chooses one. Preserve photographer/source attribution and normalize the chosen image through the existing private recipe-image path. Keep manual upload and an honest placeholder. Do not automatically attach an unrelated photo.

Acceptance: the API key stays server-side; a member can replace/remove the image; a library outage leaves manual upload and recipe saving usable; cross-household image access stays denied.

## Data, privacy and migration boundaries

- Add household-scoped category records and a nullable `category_id` on recipes with an additive migration. Existing recipes stay readable; do not silently reclassify them or rewrite order snapshots. Household membership checks apply to every new route.
- Shopping purchases are **not** pantry inventory. Store enough source-demand identity and quantity detail to distinguish already bought amounts from newly added demand, including when an order changes or closes. Keep an append-only event record for check/undo actions; never make a checkbox overwrite the underlying order demand. The exact schema and reconciliation algorithm require a focused engineering decision and real-database tests before rollout.
- Keep the current one-photo-per-recipe limit and add source/credit metadata for chosen library photos. An explicit library search may send the typed search phrase to the provider; do not send household identifiers, private notes or full recipes. A server-side API key, image host allow-list, download size limit and existing normalisation protect the image-import path.
- The invite token currently lives after `#`, so a link-preview crawler cannot read it. A generic preview can be served from `/join` without introducing a public household-lookup endpoint. Apple's [Messages preview guidance](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages) requires metadata in the server response because preview clients do not run page JavaScript.
- UI translation should use stable message keys and error codes. Do not use the recipe AI provider for static interface translations. Run accessibility checks in both locales, including longer Chinese/English labels and the browser's language setting.

## Cost and sequence

The [Pexels API documentation](https://www.pexels.com/api/documentation/) currently describes a free API with default request limits and attribution requirements. Its API fee can be zero for this feature; application storage, traffic and implementation still have costs. No recurring photo-library purchase is approved here. Automatic generated images remain out of scope. For comparison only, [Google's image pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Gemini 3.1 Flash Image at USD 0.045 for a 512 px image or USD 0.067 for a 1024 px image before input, retries and storage (roughly USD 4.50–6.70 for 100 successful outputs at those sizes). Recheck prices before any later decision to offer generation.

Proposed implementation order, each on a bounded PR with its own acceptance evidence:

1. Interface localization foundation, sign-out confirmation, favicon, visible phone photo button and desktop drag-and-drop.
2. Categories, including preset and AI suggestions with explicit member confirmation.
3. Categorized Meals browsing and the single-submit basket, using the existing order API and snapshot rules.
4. Household shopping checks, reconciliation and purchase history, after a focused data-model decision.
5. Free-library chooser and generic invite preview; verify iMessage on a real device.
6. Repeat end-to-end staging checks in both locales and on a physical phone, then complete UX-001 and REL-001. Reassess the first-release date after the owner approves the expanded scope; no new delivery date is promised here.

## Approval requested

Approve or amend this proposed scope and sequence before implementation. The most consequential choices are category ownership/one-category semantics and shopping purchase reconciliation. All active household members continue to edit the shared menu and one another's pending orders. Wallets, billing, social imports, grocery checkout and meal photos remain deferred.
