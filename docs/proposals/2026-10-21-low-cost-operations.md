# REL-001 — Low-cost operations proposal

Date: 2026-10-21. Status: **option A accepted by the owner on 2026-10-21**; recorded in [ADR 0011](../decisions/0011-low-cost-production.md). It would supersede the production-database part of [ADR 0010](../decisions/0010-production-environment.md) and the [BUDGET.md](../BUDGET.md) allocation if accepted.

## Why

The owner now expects the main users to be the owner and a few friends' households, not a growing beta. ADR 0010's Supabase Pro production (USD 25/month base) is the largest fixed cost. The goal is the lowest recurring cost that still protects real household data with a tested backup.

## Current plan and cost

| Item                                    | ADR 0010 plan                              | Monthly (USD)                           |
| --------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Production database, backups and auth   | Supabase Pro                               | 25                                      |
| App, staging app and staging PostgreSQL | Railway Hobby (USD 5 includes USD 5 usage) | 5 + usage over 5                        |
| AI drafts                               | Gemini caps: production 8.50, staging 2    | up to 10.50 (a cap, not expected spend) |
| Alerts, domain                          | UptimeRobot free, Railway domain           | 0                                       |

Fixed cost is about USD 30/month before AI and Railway overage, roughly CAD 42 at the BUDGET.md planning rate.

## Provider facts checked 2026-10-21

- Supabase Free: projects pause after one week of inactivity; 500 MB database; automatic backups not included; two active free projects. Pro: from USD 25/month with seven days of daily backups ([pricing](https://supabase.com/pricing)).
- Railway Hobby: USD 5/month including USD 5 of usage; RAM USD 10/GB-month, CPU USD 20/vCPU-month, volumes USD 0.15/GB-month, egress USD 0.05/GB ([plans](https://docs.railway.com/pricing/plans)). Database backups on Hobby were not stated there; ADR 0010 recorded them as a Pro feature.
- Railway Serverless (app sleeping) sleeps a service after 5–10 minutes without **outbound** traffic, including database connections ([docs](https://docs.railway.com/reference/app-sleeping)).
- Neon Free: 1 GB per project, 100 CU-hours/month, compute suspends after 5 minutes idle, 6-hour restore window; running out of CU-hours suspends compute until the next period ([pricing](https://neon.com/pricing)).

Code facts that affect cost:

- With `AI_PROVIDER` set, the AI worker queries the database every 5 seconds (`apps/api/src/ai-drafts.service.ts`, `POLL_INTERVAL_MS`). This keeps the app and database awake, so scale-to-zero options (Railway Serverless, Neon) do not save money unless AI is off or the worker is changed to run only when work exists.
- App sessions last up to 30 days (14 days idle; ADR 0002), and sign-in is the app's only use of Supabase. Users who are already signed in are unaffected if the Supabase auth project pauses; only new sign-ins fail until it is restored.

## Options

### A. Railway Hobby only (recommended)

- Production app **and** PostgreSQL on Railway Hobby, the same pattern staging already uses successfully. Keep the restricted runtime role (`scripts/runtime-role.mjs` is provider-independent) and the release branch.
- Sign-in through a free Supabase project used only for Auth (the existing development project or a second free one).
- Backups are ours: a daily encrypted `pg_dump`, kept for at least 14 days off Railway, plus the existing `npm run restore:drill` before release and after any backup change. Destination to decide: a scheduled GitHub Actions job with `age` encryption storing artifacts in the private repository, or a Railway cron job writing to Cloudflare R2's free tier. Both need a small implementation task and their own tests.
- Staging: set `AI_PROVIDER=off` (no 5-second polling) and try Railway Serverless on the staging app; measure whether staging usage falls. Production AI stays on with a lower cap, e.g. `AI_MONTHLY_BUDGET_USD=3`; the bulk JSON import already covers most AI-assisted entry without internal model calls.
- Cancel the Supabase Pro organization after moving production. The new production project contains only migrated empty tables, so nothing needs to be preserved; the owner confirms before deleting.

Expected cost: Railway USD 5 plus any usage above the included USD 5 (two always-on Node apps and two small PostgreSQL services; **not yet measured**), AI usually well under the cap for a few households. Planning estimate USD 5–12/month (about CAD 7–17), against about USD 30+ today.

Risks accepted:

- No provider-managed backups; data safety depends on our backup job running and its restore being tested. A missed backup must alert.
- The free Supabase Auth project can pause after a week without activity. New sign-ins then fail until the owner restores it in the dashboard; signed-in users keep working. A periodic keep-alive request might prevent pausing, but whether it counts as activity is not verified.
- Railway platform incidents (like the 2026-10-21 build outage) affect both app and database together. Running apps kept serving during that incident; builds and deploys did not.
- The migration credential remains visible to the running app (ADR 0010 residual risk, unchanged).

### B. Option A, then replace Supabase Auth with direct Google sign-in

Removes the pause risk and the last external auth dependency at no cost. It is an AUTH-001 rework (OAuth/OIDC with PKCE, state, ID-token verification, account linking for existing users) with security tests, so it is a separate later task, only if pausing becomes a real nuisance.

### C. Neon Free database with the Railway app

Free 1 GB database and a 6-hour restore window, but the 5-second AI polling would keep compute awake around the clock and exhaust the 100 CU-hours mid-month, suspending the database. Requires a worker change first and still needs our own longer-term backup. Not recommended now.

### D. Keep ADR 0010 (Supabase Pro)

Managed daily backups, no pausing, least operational work; about USD 25/month more than A.

## If A is accepted

1. Record the decision as an ADR superseding the database part of ADR 0010 and update BUDGET.md and the DEPLOYMENT.md production runbook.
2. Implement and test the backup job and its failure alert; run the restore drill against it.
3. Owner: add PostgreSQL to the Railway `production` environment, point `MIGRATION_DATABASE_URL`/`DATABASE_URL` at it (without the Supabase CA parameters), point Supabase Auth variables at the chosen free project, set staging `AI_PROVIDER=off`, lower the production AI cap.
4. Measure Railway usage for several days and update BUDGET.md with actual numbers.
5. Owner: cancel the Supabase Pro organization once production runs without it.

Nothing in this proposal changes application code, deployments or provider accounts.
