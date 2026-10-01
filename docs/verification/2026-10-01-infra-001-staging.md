# INFRA-001 Staging Verification — 2026-10-01

Status: public readiness verified; owner reports all six manual smoke steps passed on 2026-10-01 using desktop Chrome and Chrome on an iPhone 18 Pro Max. Deployment identity and migration evidence remain pending. This preview uses synthetic data only.

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

The successful sign-in and Gemini smoke imply that the relevant app variables and Supabase callback allow-list were functional during the test. Their exact settings and the `AI_MONTHLY_BUDGET_USD=2` value were not independently inspected. Do not record secret values here.

## Checks completed

| Check                 | Result                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway service state | `Active`, reported by owner 2026-10-01; deployment ID not provided                                                                                                                                                              |
| Public readiness      | PASS: external `curl` returned HTTP 200 and `{"status":"ready"}` from `/api/health/ready` on 2026-10-01 at 17:34 UTC                                                                                                            |
| Public frontend       | PASS: external `curl` returned HTTP 200 from `/` on 2026-10-01 at approximately 17:35 UTC; owner browser smoke is recorded below                                                                                                |
| Dockerfile build      | PASS: owner-provided build log shows Dockerfile stages, `npm ci`, `npm run build`, and image push                                                                                                                               |
| Runtime startup       | Owner-provided Railway log shows Nest started successfully and listened on `0.0.0.0:8080` at 18:12:44 UTC. A `Stopping Container` line has no error or surrounding deployment identity. This is not a pre-deploy migration log. |

## Owner manual smoke — fill Pass, Fail or Not run

Use Google test accounts and synthetic household/recipe data. Record the date, browser/device, result and a short observation for each row. A screenshot link may be added if it contains no secrets or invitation tokens. Failures remain visible; do not replace them with a later pass without recording the retest.

The owner marked all six rows Pass in the working tree and confirmed in chat on 2026-10-01 that all tests passed. On 2026-10-01 the owner added that testing used desktop Chrome and Chrome on an iPhone 18 Pro Max. Which steps ran on each device and per-step observations were not specified.

| Step | Action and expected result                                                                                            | Result | Date / device / observation |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------- |
| 1    | Open the public origin on a phone or desktop; the menu loads without an error.                                        | Pass   |                             |
| 2    | Sign in through Google as a test user; create a synthetic household; sign out and sign in again.                      | Pass   |                             |
| 3    | Create and save a manual recipe with measured ingredients; copy and edit a preset; upload a synthetic test photo.     | Pass   |                             |
| 4    | Generate one Gemini draft, review/edit it, explicitly save it, and confirm it appears in the household menu.          | Pass   |                             |
| 5    | Order the recipe for now or later; edit the pending order; confirm combined and by-day shopping demand; complete it.  | Pass   |                             |
| 6    | If a second Google test user is available, invite and join them; confirm they can edit the shared menu/pending order. | Pass   |                             |

The owner also reported that 200% zoom and a screen-reader check showed no problems. The specific reader, device, workflow and zoom platform were not given. See [UX-001 verification](2026-09-27-ux-001.md) for the remaining detailed checklist.

## Outcome and next action

- Staging infrastructure is reachable, and the owner reports the six product smoke steps passed on desktop and phone browsers in aggregate, with no problems reported at 200% zoom or in a screen-reader check. This does not establish that every step ran on each device or close the detailed UX-001 checklist.
- Record the deployed commit, Railway deployment ID and pre-deploy migration result when available. Resolve any later failures without overwriting this first result.
