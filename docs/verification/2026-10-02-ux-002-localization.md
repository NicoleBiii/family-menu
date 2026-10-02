# UX-002 Interface Localization — 2026-10-02

Scope: English and Simplified Chinese interface text across the shell, household, join, menu, recipe editor, AI draft panel, meals/order editor and shopping pages. Recipe titles, ingredients, steps, notes and household/member names stay as written. No API, database migration or new package.

Branch `codex/ux-002-localization`. Codex wrote the shell/household/menu foundation (`1acd032`) and most of the remaining page translations; Claude Code took over the uncommitted page work after Codex stopped, reviewed it and completed this checkpoint.

## Behavior

- A visible `简体中文 / English` control is available before and after sign-in. The first visit follows the browser language; an explicit choice is stored on the device (storage failure falls back to the in-memory choice). `html lang` is `zh-Hans` or `en`.
- Dates, day labels (`今天/明天/昨天`), invitation expiry dates and units use the selected locale. Chinese quantities use Chinese unit names without English plurals.
- Error messages: English keeps the server's specific 4xx text. Known stable server codes (`nonexistent_time`, the four AI refusal codes and the six AI draft failure codes) map to translated messages in both languages; otherwise Chinese falls back to a per-status message. This also fixes English `ai_disabled` and `budget_exhausted` (HTTP 503), which previously showed the generic server-error text. Browser photo preparation errors carry codes and are translated.
- Messages are stable keys in `apps/web/src/i18n.tsx`; the Chinese table is typed against the English keys, so a missing translation fails the typecheck. Static interface text does not use the recipe AI provider.

## Acceptance evidence

| Criterion (proposal §1)                          | Evidence                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Browser language on first visit; choice persists | `localization.spec.ts`: `zh-CN` context opens in Chinese; after choosing English and reloading, English and `lang="en"` remain           |
| Switching keeps an in-progress form              | Household name, menu search, recipe name/ingredient and order notes keep their values across a switch                                    |
| Sign-in and join work in both languages          | English flows in existing suites; Chinese sign-in and household creation, and a Chinese-browser member joining an English owner's invite |
| Member content is not translated                 | Chinese recipe saved, ordered and shown on the shopping list with its original text; English preset names unchanged in Chinese           |
| Error messages follow the locale                 | `ai-drafts.spec.ts`: a mock provider failure shows the translated Chinese message from its error code                                    |
| Accessibility in both locales                    | `accessibility.spec.ts`: axe WCAG 2.2 A/AA scans of Chinese Menu, Household, Meals and Shopping report 0 violations, without overflow    |

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database:

- Full `npm run check` after the error-code change: format, lint, typechecks, builds, 68/68 integration tests and 56/56 desktop/mobile browser cases passed.
- After adding the Chinese join case: focused `localization.spec.ts` 8/8 passed (desktop and mobile). The full suite was not repeated for this test-only addition; PR CI reruns it.

## Not verified

- No visual review by a Chinese reader on a real phone; wording is the agents' translation and may need owner edits.
- Server error messages without a stable code are shown in Chinese only as per-status generic messages.
- The Chinese signed-in screens have axe coverage only through the flows above, not a dedicated signed-in Chinese scan.
