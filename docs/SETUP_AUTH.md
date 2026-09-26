# Google Sign-in Setup (Supabase Auth)

Status: required for AUTH-001's real-provider smoke test. The code is implemented and locally verified against a stub; it has not yet run against real Google/Supabase accounts.

Console labels change over time. Steps were checked against Supabase and Google documentation on 2026-09-26; follow the current console wording if it differs.

## What the app needs

| Variable                   | Where it comes from                               | Secret?                                 |
| -------------------------- | ------------------------------------------------- | --------------------------------------- |
| `SUPABASE_URL`             | Supabase project URL, `https://<ref>.supabase.co` | No                                      |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_...`)   | Low privilege; still keep it out of Git |
| `APP_ORIGIN`               | The URL you open in the browser                   | No                                      |

The Google **client secret** is pasted only into the Supabase dashboard. The app never needs it, nor a Supabase secret/service-role key; the server refuses to start with an `sb_secret_` or `service_role` key in `SUPABASE_PUBLISHABLE_KEY`.

## 1. Supabase project

1. Create a Supabase account and a project for **development/staging only**. Keep production as a separate project later.
2. Save the database password in a password manager. The app does not use the Supabase database yet; its data stays in the local PostgreSQL.
3. Copy the **Project URL** and a **publishable key** from the project's API keys settings (or the Connect dialog).
4. Check the current free-plan limits and inactivity pausing rules before relying on it.

## 2. Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, then open Google Auth Platform:

1. **Branding**: app name (e.g. Family Menu Dev), user support email, developer contact.
2. **Audience**: External, publishing status **Testing**. Add every Google account that should be able to sign in as a test user. Only these accounts can sign in while the app is in Testing.
3. **Data access**: scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive scopes.
4. **Clients → Create client → Web application**:
   - Authorized redirect URI: the callback shown on Supabase's Google provider page, `https://<ref>.supabase.co/auth/v1/callback`.
   - Authorized JavaScript origins are not required for this server-side flow.
5. Copy the client ID and client secret.

## 3. Connect Google to Supabase

1. Supabase → Authentication → Providers (Sign In / Providers) → **Google**: enable, paste client ID and secret, save.
2. Supabase → Authentication → **URL Configuration**:
   - Site URL: `http://127.0.0.1:5173` for local development.
   - Redirect URLs: add exactly `http://127.0.0.1:5173/api/auth/callback`. Add each future staging/production origin as `https://<host>/api/auth/callback`.

## 4. Local configuration

Edit the ignored `.env` file in the repository root (never commit it or paste values into chat):

```sh
APP_ORIGIN=http://127.0.0.1:5173
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use `127.0.0.1` consistently. `localhost` is a different cookie site and a different allow-list entry.

## 5. Smoke test to record

Run `npm run db:local`, `npm run db:migrate`, `npm run dev`, then open `http://127.0.0.1:5173/household`:

1. Sign in with a test-user Google account → you return to the Household page signed in.
2. Create a household, create an invitation link.
3. In a private window, open the link, sign in with a second test user and join.
4. As owner, remove the second user; their Household page no longer shows it.
5. Sign out; `/api/households` returns 401.
6. Negative: cancel on the Google screen → the app shows "Google sign-in was cancelled."

Record date, commit, Supabase project (by name, not keys), and results in a new `docs/verification/` file. Until then, AC-01's real-provider check remains open.

## Staging/production notes

- `APP_ORIGIN` must be `https://...`; cookies then use the `__Host-` prefix and `Secure`.
- Each environment needs its own redirect URL entry. Moving the Google app to **In production** requires completing Google's branding requirements; verification requirements depend on scopes and should be checked at that time.
