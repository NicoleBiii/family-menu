# INFRA-001 Staging Verification — 2026-10-01

Status: public readiness verified; owner manual smoke pending. This preview uses synthetic data only.

## Environment and release identity

| Field                 | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Railway environment   | `staging`                                               |
| Public origin         | `https://family-menu-staging.up.railway.app`            |
| Git branch            | `main` (owner-reported Railway service setting)         |
| Deployed commit       | Pending: copy from Railway deployment details           |
| Railway deployment ID | Pending: copy from Railway deployment details           |
| Applied migration     | Pending: confirm from pre-deploy logs                   |
| Database service      | PostgreSQL, connected via `DATABASE_URL` (owner report) |

Do not paste variable values, API keys, session cookies, invitation tokens or personal records into this file.

Before the owner smoke, confirm in Railway that the app service has `APP_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_PROVIDER=gemini`, `GEMINI_API_KEY` and `AI_MONTHLY_BUDGET_USD=2`, and that Supabase allows this origin's `/api/auth/callback`. Record only that each is configured, never its value. These confirmations have not yet been reported.

## Checks completed

| Check                 | Result                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway service state | `Active`, reported by owner 2026-10-01; deployment ID and logs not independently inspected                                                          |
| Public readiness      | PASS: external `curl` returned HTTP 200 and `{"status":"ready"}` from `/api/health/ready` on 2026-10-01 at 17:34 UTC                                |
| Public frontend       | PASS: external `curl` returned HTTP 200 from `/` on 2026-10-01 at approximately 17:35 UTC; visual rendering and browser interaction not yet checked |
| Dockerfile build      | PASS: owner-provided build log shows Dockerfile stages, `npm ci`, `npm run build`, and image push; runtime and migration logs not provided          |

## Owner manual smoke — fill Pass, Fail or Not run

Use Google test accounts and synthetic household/recipe data. Record the date, browser/device, result and a short observation for each row. A screenshot link may be added if it contains no secrets or invitation tokens. Failures remain visible; do not replace them with a later pass without recording the retest.

| Step | Action and expected result                                                                                            | Result  | Date / device / observation |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------- |
| 1    | Open the public origin on a phone or desktop; the menu loads without an error.                                        | Not run |                             |
| 2    | Sign in through Google as a test user; create a synthetic household; sign out and sign in again.                      | Not run |                             |
| 3    | Create and save a manual recipe with measured ingredients; copy and edit a preset; upload a synthetic test photo.     | Not run |                             |
| 4    | Generate one Gemini draft, review/edit it, explicitly save it, and confirm it appears in the household menu.          | Not run |                             |
| 5    | Order the recipe for now or later; edit the pending order; confirm combined and by-day shopping demand; complete it.  | Not run |                             |
| 6    | If a second Google test user is available, invite and join them; confirm they can edit the shared menu/pending order. | Not run |                             |

The real-phone, screen-reader and 200% zoom checks remain tracked in [UX-001 verification](2026-09-27-ux-001.md). A desktop browser smoke alone does not complete those checks.

## Outcome and next action

- Staging infrastructure is reachable; product smoke has not yet been reported.
- After the owner completes the rows, record any failures, deployment identity and migration result, then update INFRA-001 status and the handoff.
