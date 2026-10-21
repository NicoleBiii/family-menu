# ADR 0011 — Low-cost production: Railway PostgreSQL with our own encrypted backups

Date: 2026-10-21. Status: **accepted by the owner on 2026-10-21** (option A of the [low-cost operations proposal](../proposals/2026-10-21-low-cost-operations.md)). It supersedes the production database, backup and sign-in-project parts of [ADR 0010](0010-production-environment.md). ADR 0010's release branch, restricted runtime login, UptimeRobot alert and Railway domain remain.

## Context

The owner expects the users to be the owner and a few friends' households. Supabase Pro (USD 25/month base) was the largest fixed cost. Staging already runs the app and PostgreSQL on Railway Hobby successfully.

## Decision

- **Database:** production PostgreSQL is a Railway database service in the `production` environment, reached by the app over Railway's private network. Migrations run as the database owner (`MIGRATION_DATABASE_URL`); the app uses the restricted `family_menu_app` login (`DATABASE_URL`), as in ADR 0010.
- **Sign-in:** a free Supabase project used only for Auth (Google), separate from the development project. App sessions remain app-owned (ADR 0002).
- **Backups:** the scheduled GitHub Actions workflow `.github/workflows/backup.yml` runs daily. It connects through Railway's public TCP proxy as a dedicated read-only login (`family_menu_backup`, created by `scripts/runtime-role.mjs` when `BACKUP_DB_PASSWORD` is set). `scripts/backup.mjs` dumps the `app` schema and migration bookkeeping from one exported snapshot and writes a manifest of migrations, per-table row counts and the photo digest. The workflow encrypts the archive with the owner's `age` public key and keeps it as a private-repository artifact for 14 days. Only the owner's private key, kept in the password manager, can decrypt it.
- **Restore proof:** `npm run restore:drill` restores a decrypted backup (`BACKUP_DIR`) into an empty local database and compares it with the manifest. CI runs the same backup → restore → compare round trip on every pull request against the integration-test database, using the read-only login.
- **AI:** production cap `AI_MONTHLY_BUDGET_USD=3`; staging runs with `AI_PROVIDER=off` so the 5-second AI worker poll does not keep it awake, and may use Railway Serverless.
- **Supabase Pro:** cancelled by the owner once production runs and a backup has been restored successfully. Its project holds only migrated empty tables.

## Consequences

- Expected recurring cost is the Railway Hobby USD 5 plus usage above the included USD 5, and actual AI use under a USD 3 cap; a planning estimate of USD 5–12/month, to be replaced by measured usage.
- Data safety depends on the backup workflow. GitHub emails a failed scheduled run to the person who last changed the schedule; nothing alerts if scheduled workflows are disabled or the email is missed, so the owner checks the Actions list periodically. A backup's age is visible in the artifact name.
- The database is reachable through Railway's public proxy, protected by its generated owner password and the backup login's own password. The backup secret in GitHub can read all household data but cannot write.
- Recovery point is up to one day; recovery requires the owner's age key and a manual `pg_restore` (DEPLOYMENT.md).
- The free Supabase Auth project pauses after a week without activity; new sign-ins fail until the owner restores it, while signed-in users keep working. Replacing Supabase Auth with direct Google sign-in (proposal option B) is deferred.
- App and database share one provider; a Railway incident affects both. The migration credential remains visible to the running app (ADR 0010 residual risk).
- `certs/supabase-ca.crt` stays in the repository but is unused while production does not connect to a Supabase database.
