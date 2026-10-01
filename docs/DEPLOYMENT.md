# Deployment Setup and Remaining Gates

Status (2026-10-01): the Railway preview has an `Active` app service in `staging`, and its public readiness endpoint returns HTTP 200. Owner manual product smoke is pending; see [staging verification](verification/2026-10-01-infra-001-staging.md). Owner decisions for the preview: the app on Railway Hobby, PostgreSQL on Railway, Google sign-in through the existing Supabase development project, and AI drafts through a separate Gemini key with a low budget.

## Local preview

Use the README commands. The built application serves the frontend and API on the same origin. `.env` is ignored by Git; `.env.example` contains only loopback development configuration.

## Railway preview runbook (INFRA-001)

The preview is for the owner's phone checks and synthetic test data only, not for real household data (see "Before inviting real households").

The owner does the account steps, because they involve creating accounts and entering payment details. Console labels may differ from the wording here.

1. **Railway account and project.**
   1. Sign up at railway.com with GitHub and choose the Hobby plan. It costs USD 5 a month, with USD 5 of usage included.
   2. Set a usage limit or alert in the workspace's usage settings.
   3. Create a project with **Deploy from GitHub repo** and pick `NicoleBiii/family-menu`, branch `main`. The service tile sourced from this repository is the **app service**; its Settings page contains Source, Networking, Build and Deploy. Project Settings is a different page. Leave Root Directory empty so the repository-root `Dockerfile` is used.
2. **Database.** In the same project, choose **New → Database → PostgreSQL**. Keep it on the private network.
3. **Configure the app service before its first deploy.** Railway deprecated Config as Code on 2026-08-28, and new services cannot opt into it. The repository's `railway.json` is **not an applied configuration for a new service**. In the app service Settings, select the Dockerfile builder if offered; leave custom build and start commands empty because the root `Dockerfile` defines both. Set **Pre-Deploy Command** to `node scripts/migrate.mjs` and **Healthcheck Path** to `/api/health/ready`. A failed migration must stop deployment. Enable **Wait for CI** once Railway's GitHub App permissions are accepted. Confirm the branch is `main`.
4. **First-deploy variable.** In the app service Variables tab, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (adjust `Postgres` if the database service has a different name). Leave the Supabase and AI variables unset for the initial deploy. `APP_ORIGIN` is required once sign-in variables are set, so the public domain must be known first.
5. **Apply staged changes.** Return to the project canvas. If a pending-changes banner appears, click **Deploy** there to create the staged services. The first build log should say `Using detected Dockerfile!`; otherwise select Dockerfile in the Build settings and redeploy. Confirm the pre-deploy migration and readiness check pass. Railway support has documented that an undeployed staged service can show `Could not load public networking` and the same error under Scale; deploy the pending changes before treating this as a networking fault.
6. **Public domain.** In the app service (the tile sourced from `NicoleBiii/family-menu`), open Settings → Networking → Public Networking → **Generate Domain**. You get an HTTPS address like `family-menu-staging.up.railway.app`. If Networking still fails to load after the service has deployed, check Railway's status page and contact Railway support with the project/service/environment identifiers and the error; do not delete the service to clear the error.
7. **Final app variables.** Set these on the app service, in its Variables tab:

   | Variable                   | Value                                                                       |
   | -------------------------- | --------------------------------------------------------------------------- |
   | `APP_ORIGIN`               | `https://${{RAILWAY_PUBLIC_DOMAIN}}`                                        |
   | `SUPABASE_URL`             | the Supabase development project URL (same as local)                        |
   | `SUPABASE_PUBLISHABLE_KEY` | its publishable key (same as local)                                         |
   | `AI_PROVIDER`              | `gemini`                                                                    |
   | `GEMINI_API_KEY`           | a separate key named `family-menu-staging`, billing enabled; mark it Sealed |
   | `AI_MONTHLY_BUDGET_USD`    | `2`                                                                         |

   Keep `DATABASE_URL` from step 4. `HOST` and `PORT` come from the image and from Railway. Never put secrets in frontend build variables. The app reads none.

8. **Sign-in redirect.** In Supabase, open Authentication → URL Configuration → Redirect URLs and add `https://<generated-domain>/api/auth/callback`, keeping the local entry. The Google OAuth client does not change: it redirects to Supabase. Only accounts listed as Google test users can sign in.
9. **Redeploy and check.**
   1. Redeploy after setting the variables.
   2. `https://<domain>/api/health/ready` should answer `{"status":"ready"}`.
   3. Record the smoke test in `docs/verification/`: sign in, create a household, add a recipe, run an AI draft, order it and view the shopping list. The UX-001 phone and screen-reader checklist uses this URL.

Railway deploys every push to `main`, which has passed CI through its pull request.

Railway references checked 2026-09-30: [Config as Code deprecation](https://docs.railway.com/config-as-code), [Dockerfile detection](https://docs.railway.com/builds/dockerfiles), [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command), [healthchecks](https://docs.railway.com/deployments/healthchecks), and the [matching staged-service Networking error](https://station.railway.com/questions/could-not-load-public-networking-6536cb38).

### Preview limitations (accepted for synthetic data only)

- **One database credential.** Railway's pre-deploy step shares the app's variables, so the migration and runtime credential are the same. A restricted runtime login, with the migration credential kept out of the runtime environment, is required before real household data (REL-001).
- **Backups.** Railway volume backups, their plan availability and restore steps are not yet verified. There is no backup or restore drill yet.
- **Alerting.** The only alert is Railway's usage alert. There is no external availability alert yet.
- **Image checks.** CI runs the built image against a fresh database (pre-deploy migration, readiness and page load). The first Railway deploy is the first run on the real platform.

## Repository and CI

- The repository is private on GitHub. CI ("Quality checks") runs on every pull request and on `main`: format, lint, types, builds, integration and browser tests, OpenAPI drift, a runtime dependency audit, and building and starting the deployment image.
- Branch protection needs GitHub Pro or a public repository, so the PR-plus-CI rule is a convention for now (AGENTS.md).
- CI does not include comprehensive secret scanning, and it is not a security certification.

## Release record

Record the source commit, the Railway deployment identifier, the migration version, the environment, the smoke results and a compatible recovery action. Railway builds from the commit rather than promoting the CI image, so the release record must say so. Verify that deployment itself; do not claim it is the image CI tested.

Migrations are forward-only at this stage. Do not delete tables or restore an old database merely to revert the application.

- A safe app rollback (Railway "Redeploy" of an earlier deployment) requires a compatible schema; otherwise use a reviewed forward fix.
- Backup restoration is a separate incident action with possible data loss.

## Before inviting real households

- A separate production environment: database with verified backups and a restore drill, a restricted runtime database login, and its own Supabase project and paid Gemini key.
- A production Google OAuth client, or the published app.
- Alert delivery and cost alerts exercised.
- The remaining acceptance checks (AC-15) and the UX-001 phone and screen-reader checklist.
