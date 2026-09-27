# AUTH-001 Real-Provider Smoke Test — 2026-09-26

Performed by the owner on her Mac (Chrome, `npm run dev`, `http://127.0.0.1:5173`) against her Supabase development project and a Google OAuth client in Testing mode, at commit `b5b5a1a`. Results are as reported by the owner; no logs or keys were shared.

| Step (docs/SETUP_AUTH.md §5)                                              | Result                                  |
| ------------------------------------------------------------------------- | --------------------------------------- |
| 1. Sign in with a Google test user, return to Household signed in         | Passed                                  |
| 2. Create a household and an invitation link                              | Passed                                  |
| 3. Second test user opens the link in a private window, signs in, joins   | Passed                                  |
| 4. Owner removes the second user; their Household page no longer shows it | Passed                                  |
| 5. Sign out; `/api/households` returns 401                                | Passed                                  |
| 6. Cancel on the Google screen → "Google sign-in was cancelled."          | Not reachable via Google UI (see below) |

## Finding from step 6

After signing out of the app, "Sign in" returned straight to the app without any Google screen, even after clearing cookies for the app. Google silently reuses the browser's existing Google session and previously granted consent. The app session itself was correctly revoked (step 5); this is Google-side single sign-on, not a session leak.

This matters for a shared family device: signing out of Family Menu and signing in again reused the same Google account without a chance to switch. Fix: the authorize request now sends `prompt=select_account`, which Supabase forwards to Google so the account chooser always appears (asserted in the integration test). Commit: see `git log` after `b5b5a1a`.

## Still to re-test

- Step 6 with the fix: the account chooser should appear on every sign-in. To reach a Cancel button, either close the chooser with the browser Back button, or first remove the app's access at Google Account → Security → Third-party connections so the consent screen (with Cancel) appears.
- App sign-out does not sign the user out of Google itself; that is expected and documented.

## Re-test after `f8d17d5`

- The Google account chooser now appears on every sign-in (confirms `prompt=select_account` is forwarded by Supabase).
- Browser Back from the chooser returns to the app's signed-out page. No callback is made, no session is created, and the unused login state expires after 10 minutes. This is correct; no "cancelled" message is expected because the app is never told.
- After removing the app's access in the Google account's third-party connections, sign-in showed no screen with a Cancel button. For the basic `openid email profile` scopes Google's current flow offers no explicit deny step, so the `provider_denied` path cannot be triggered from the real UI. It remains covered by the automated integration test (provider `error=access_denied` → `/?authError=provider_denied`, no session).

Conclusion: AUTH-001's real-provider acceptance (AC-01 sign-in, create, invite, join; AC-03 removal) passed. The provider-denial path is verified only against the stub.
