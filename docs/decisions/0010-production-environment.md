# ADR 0010 — Production environment, backups, runtime login and alerts

Date: 2026-10-03. Status: **accepted by the owner on 2026-10-03** for the first family release (REL-001). It replaces the open production-database question in [BUDGET.md](../BUDGET.md) and implements the "Before inviting real households" gates in [DEPLOYMENT.md](../DEPLOYMENT.md).

## Context

The owner wants to release as soon as the release checklist is complete, instead of waiting for the planned 2026-10-16 date. Staging holds synthetic data only. Real household data needs:

- a separate production environment;
- verified backups and a restore drill;
- a database login for the app that cannot change the schema;
- an alert that reaches the owner.

Provider facts checked on 2026-10-03:

- Railway volume backups are a Pro-plan feature; the Hobby plan used for staging has none ([Railway community answer](https://station.railway.com/questions/can-i-extend-hobby-plan-with-db-backup-m-22b1ce14), [backups reference](https://docs.railway.com/reference/backups)). Railway's backup documentation itself does not state plan availability.
- Supabase Free projects pause after 7 days without enough database activity ([project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). The app uses Supabase only at sign-in, so a free production auth project could pause between family sign-ins.
- Supabase Pro costs USD 25/month per organization, including one project's compute and seven days of daily backups. Paid projects do not pause ([pricing](https://supabase.com/pricing)).

## Owner decisions (2026-10-03)

1. **Production database and sign-in: Supabase Pro.** Production data and auth live in a new Supabase organization on Pro, with a single project. Keeping the development project in a separate free organization avoids paying for its compute. The app keeps running on Railway, in a new `production` environment. Alternatives were Railway Pro (USD 20/month and up, but a free Supabase auth project risks pausing) and Railway Hobby with self-built `pg_dump` backups (cheapest, but the most to maintain).
2. **Alerts: UptimeRobot free.** One HTTPS keyword monitor on `/api/health/ready` (expects `ready`) every 5 minutes, emailing the owner. Railway's usage alert and Supabase's billing emails cover cost.
3. **Address: a free Railway domain** (e.g. `family-menu.up.railway.app`) for now; a custom domain can be added later without code changes.

## Design defaults

- **Release path.** Staging keeps deploying every merge to `main`. Production deploys from a `release` branch. Each release fast-forwards `release` to a `main` commit that has passed CI and staging smoke testing. This keeps production from changing on every merge. Rolling back means redeploying an earlier Railway deployment when the schema is compatible (DEPLOYMENT.md "Release record").
- **Database connection.** Use Supabase's session pooler (IPv4, port 5432); the direct connection is IPv6-only without a paid add-on. URLs add `sslmode=verify-full&sslrootcert=/app/certs/supabase-ca.crt`. The public Supabase CA certificate is committed under `certs/`; it is not a secret. The `pg` driver then verifies the server certificate and host name, with no code change.
- **Restricted runtime login.** `scripts/runtime-role.mjs` (re)creates `family_menu_app` with no superuser, role or database creation rights. It may only use rows in `app`: it cannot create objects, and on `app.audit_events` it may insert and read but not update, delete or truncate. Default privileges extend this to tables added by later migrations, which run as the owner login. Railway's pre-deploy command becomes `node scripts/migrate.mjs && node scripts/runtime-role.mjs`. It uses `MIGRATION_DATABASE_URL` (owner login). The app uses `DATABASE_URL` (the runtime login).
  - **Residual risk.** Railway shares one variable set between the pre-deploy step and the running app. The migration credential is therefore readable by the app process. The restriction stops schema changes or audit tampering through the app's own queries, e.g. a SQL injection. It does not protect against code execution inside the container. Moving migrations out of Railway (from the owner's Mac or a separate service) would close this. It is deferred for the family beta and recorded as a known limitation.
  - The integration suite, the browser suite's server and CI's image check all run the app as such a role. They prove every feature works without extra rights.
- **Backups and restore drill.** Supabase Pro's daily backups (7 days) are the primary backup; photos are in PostgreSQL (ADR 0003), so they are included. The release drill restores a `pg_dump` of production into a new, empty database on a separate server: a local PostgreSQL 17 on the owner's Mac, matching Supabase's major version. It then compares migrations, per-table row counts and a digest of all photo bytes (`npm run restore:drill`). The dump is deleted afterwards and nothing but counts is printed. Restoring a Supabase daily backup in place is an incident action with possible data loss; it is not part of the drill.
- **Sign-in.** The production Supabase project uses the existing Google OAuth client. Its callback URL is added to that client. The consent screen stays in Testing mode, with family members' Google accounts as test users (up to 100). This fits an invite-only family release; publishing the app is deferred.
- **AI and photos.** A separate Gemini key named `family-menu-production` with `AI_MONTHLY_BUDGET_USD=8.50` (≈ CAD 12). A Pexels key is optional; manual upload works without it.

## Consequences

- Recurring cost becomes about CAD 35 (Supabase Pro) plus Railway usage for two environments, AI and contingency. This stays within the CAD 85 allocation; see BUDGET.md.
- New owner tasks are account, billing, key and dashboard steps (DEPLOYMENT.md "Production runbook"). The agent prepares commands and records evidence; it does not enter passwords or payment details.
- A future migration that adds an append-only table must also update `scripts/runtime-role.mjs`.
