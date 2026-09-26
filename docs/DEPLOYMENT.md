# Deployment Setup and Remaining Gates

Status: configuration prepared, not deployed. No service purchase or GitHub publication has occurred.

## Local preview

Use the README commands. The built application serves the frontend and API on the same origin. `.env` is ignored by Git; `.env.example` contains only loopback development configuration.

## Repository setup still needed

1. Select the GitHub repository destination and visibility before publication. Review the docs for personal context appropriate to that audience.
2. Push the current branch, run the prepared CI workflow, and inspect the result for the exact commit.
3. Configure the main-branch ruleset to require the `Quality checks` job and the chosen review policy. Avoid administrative bypass as a routine workflow.
4. Enable available secret scanning/push protection and configure a suitable secret scanner if required by the repository plan. The current CI includes a runtime dependency audit, not comprehensive secret scanning or security certification.
5. Use protected deployment environments and least-privilege credentials when deployment is connected.

## Isolated staging before production

- Select/provision the chosen database/auth/storage and application services using the budget document.
- Keep staging credentials, database, bucket, callback URLs, and synthetic users separate from production.
- Use the `app` schema for domain data. Do not expose it through the Supabase Data API. Disable unused data endpoints where appropriate.
- Provision a restricted runtime database login, with only required privileges on the schema/tables. Use a separate owner/migration credential. The local helper's owner credential is not a production configuration.
- Set `DATABASE_URL`, `HOST=0.0.0.0`, and the platform port. Add provider/session secrets only when AUTH-001 implements those integrations; never place them in frontend build variables.
- Run `node scripts/migrate.mjs` as one controlled release step with the migration credential. The migration runner uses `MIGRATION_DATABASE_URL` if present, otherwise `DATABASE_URL`. Keep migration credentials out of the ordinary runtime environment.
- The Dockerfile produces a non-root runtime image. Test its build and startup; this has not been verified on the current host because Docker is absent.
- Railway's configured readiness URL is `/api/health/ready`. It intentionally fails until the schema is migrated. A liveness check alone does not establish database availability.

## Release record

Record the source commit, container digest or platform release identifier, migration version, environment, smoke results, and compatible recovery action. Promote the tested artifact when supported. If a platform rebuilds it, record that distinction and verify the resulting build rather than claiming it is the same immutable artifact.

Migrations are forward-only at this stage. Do not delete tables or restore an old database merely to revert the application. A safe app rollback requires compatible schema; otherwise use a reviewed forward fix. Backup restoration is a separate incident action with possible data loss.

## Before inviting real households

Complete authentication and household authorization first, then the remaining MVP checks. Exercise real provider callbacks, private-image access, cost controls, alert delivery, and database-plus-file restoration. The current sample preview is not ready for real household data.
