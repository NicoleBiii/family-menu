# Deployment Setup and Remaining Gates

Status (2026-10-01): the Railway preview has an `Active` app service in `staging`, and its public readiness endpoint returns HTTP 200. The owner reports all six product-smoke steps passed using desktop Chrome and iPhone Chrome; deployment identity and migration evidence remain pending. See [staging verification](verification/2026-10-01-infra-001-staging.md). Owner decisions for the preview: the app on Railway Hobby, PostgreSQL on Railway, Google sign-in through the existing Supabase development project, and AI drafts through a separate Gemini key with a low budget.

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

   Optional after the photo-library PR is deployed: set a sealed `PEXELS_API_KEY` on the app service to enable explicit Pexels search. Without it, the library chooser reports that it is unavailable; manual photo upload and recipe saving still work. Keep the key out of frontend variables and logs. Apply migration 009 before running that release.

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

## Production runbook (REL-001, ADR 0010 and 0011)

Production holds real household data. The decisions and their reasons are in [ADR 0010](decisions/0010-production-environment.md) and [ADR 0011](decisions/0011-low-cost-production.md), which moved the database to Railway with our own encrypted backups. The owner does every account, billing, password and key step; console labels may differ. Keep every generated password and key in a password manager, mark Railway variables **Sealed**, and never paste them into chat, issues or repository files. Generate passwords of at least 24 letters and digits so they need no URL escaping.

### P1. Supabase sign-in project (free)

1. Use a free Supabase project for production sign-in only, separate from the development project (a free organization allows two active projects). The project first created in the free organization for production can be reused.
2. **Authentication → Sign In / Providers → Google:** enable it with the existing Google OAuth client ID and secret. In Google Cloud Console, add this project's callback (`https://<project-ref>.supabase.co/auth/v1/callback`) to the client's authorized redirect URIs. Add every family member's Google account as a **test user** on the consent screen.
3. **Authentication → URL Configuration:** set Site URL to the production origin (P2.5) and add `https://<production-domain>/api/auth/callback` to Redirect URLs.
4. Copy the project URL and the **publishable** key (never a secret or `service_role` key).

### P2. Railway production environment

1. In the Railway project, use the environment named `production` (empty, not duplicated from staging).
2. **New → Database → PostgreSQL** in `production`. Keep its name `Postgres` (or adjust the references below).
3. The app service from `NicoleBiii/family-menu`: branch **`release`**, Dockerfile builder, Healthcheck Path `/api/health/ready`, **Wait for CI** on, region near the database, Pre-Deploy Command:

   ```
   node scripts/migrate.mjs && node scripts/runtime-role.mjs
   ```

4. App service variables (secrets Sealed). Remove any earlier Supabase database URLs.

   | Variable                   | Value                                                                                                                |
   | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
   | `MIGRATION_DATABASE_URL`   | `${{Postgres.DATABASE_URL}}`                                                                                         |
   | `RUNTIME_DB_ROLE`          | `family_menu_app`                                                                                                    |
   | `RUNTIME_DB_PASSWORD`      | a new random password                                                                                                |
   | `DATABASE_URL`             | `postgresql://family_menu_app:<runtime password>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}` |
   | `BACKUP_DB_PASSWORD`       | another new random password (creates the read-only `family_menu_backup` login)                                       |
   | `APP_ORIGIN`               | `https://${{RAILWAY_PUBLIC_DOMAIN}}`                                                                                 |
   | `SUPABASE_URL`             | the P1 project URL                                                                                                   |
   | `SUPABASE_PUBLISHABLE_KEY` | the P1 publishable key                                                                                               |
   | `AI_PROVIDER`              | `gemini` (or `off`)                                                                                                  |
   | `GEMINI_API_KEY`           | a new key named `family-menu-production`, billing enabled (required when `AI_PROVIDER=gemini`)                       |
   | `AI_MONTHLY_BUDGET_USD`    | `3`                                                                                                                  |
   | `PEXELS_API_KEY`           | optional                                                                                                             |

5. **Networking → Generate Domain**, e.g. `https://family-menu.up.railway.app`. Use it in P1.3.
6. The agent or owner points `release` at a `main` commit that has passed CI and staging smoke testing; Railway then deploys it. The pre-deploy log lists each migration, `Runtime database role is up to date.` and `Backup database role is up to date.` A failure prints only an error code, e.g. `ENOENT` (missing file), `28P01` (wrong password), `ECONNREFUSED`/`ETIMEDOUT` (network).
7. **Staging cost:** set staging `AI_PROVIDER=off` and try Railway Serverless on the staging app service; compare usage after a few days.

### P3. Daily encrypted backup

1. On the owner's Mac: `brew install age`, then `age-keygen -o family-menu-backup.key`. It prints the public key (`age1…`). Save the whole key file content as a secure note in the password manager, then delete the file. Without this key no backup can be restored.
2. In the Railway `production` Postgres service, find the public TCP proxy host and port (its `DATABASE_PUBLIC_URL` shows them).
3. GitHub repository → Settings → Secrets and variables → Actions:
   - Secret `BACKUP_DATABASE_URL`: `postgresql://family_menu_backup:<backup password>@<proxy host>:<proxy port>/<PGDATABASE>?sslmode=require`
   - Variable `BACKUP_AGE_RECIPIENT`: the `age1…` public key
   - Variable `BACKUP_ENABLED`: `true`
4. Actions → **Backup** → Run workflow. It should finish green with an artifact named `family-menu-<UTC time>`. It then runs daily at 09:17 UTC and keeps each artifact for 14 days.
5. Make sure GitHub notification settings email failed Actions runs. Glance at the Actions list weekly; the newest artifact should be at most a day old.

### P4. Alerts

1. Create a free UptimeRobot account with the owner's email.
2. Add a **Keyword** monitor: URL `https://<production-domain>/api/health/ready`, keyword `ready` (alert when it does not exist), interval 5 minutes, email alert contact.
3. Prove delivery once: temporarily change the keyword to one that is absent (e.g. `drill`), wait for the alert email, then restore `ready` and wait for the recovery email. Record both times.
4. Keep Railway's workspace usage alert and Google AI Studio's budget alert on.

### P5. Release checks

1. **Smoke test** on the production origin with family test users: sign in, create the household, add a recipe, run one AI draft, order from Home, check shopping, invite a second member. Nothing personal goes into the repository record.
2. **Restore drill** on the owner's Mac, from a real backup artifact:
   1. Install and start a local PostgreSQL of the backup's major version or newer (`manifest.json` → `serverMajor`), e.g. `brew install postgresql@17` and `brew services start postgresql@17`.
   2. Download the newest artifact from the Backup workflow run and unzip it. Restore the age key from the password manager to a temporary file, then `mkdir drill-backup && age -d -i family-menu-backup.key family-menu-*.tar.age | tar -x -C drill-backup`.
   3. `BACKUP_DIR=drill-backup DRILL_SERVER_URL=postgresql://localhost/postgres PG_BIN=$(brew --prefix postgresql@17)/bin npm run restore:drill`. It prints counts, timings and `match`/`mismatch`; record that output.
   4. Delete `drill-backup`, the downloaded archive and the temporary key file.
3. **Release record** in `docs/verification/`: source commit, Railway deployment ID, the pre-deploy output, smoke results, the alert drill, the backup run and restore drill and the rollback option.
4. **Supabase Pro:** after the release record, the owner deletes the Pro production project and cancels the Pro organization's plan.

### Restoring production after data loss

Restoring replaces data and can lose changes made after the backup; the owner decides. Decrypt the chosen backup and run the restore drill on it first (P5.2), so the copy is known to be complete. Create an empty database (a new Railway Postgres service, or a new database on the existing one), then restore with its owner URL: `pg_restore --no-owner --no-acl --exit-on-error --dbname=<owner URL> app.dump` and the same for `migrations.dump`, using tools of the server's major version. Point `MIGRATION_DATABASE_URL`/`DATABASE_URL` at it and redeploy, so the pre-deploy step recreates the runtime and backup logins and grants.

### Known limitations accepted for the family release

- The migration credential is visible to the running app on Railway (ADR 0010 residual risk).
- Backups depend on our scheduled workflow; recovery point is up to one day; restoring needs the owner's age key (ADR 0011).
- The database is reachable through Railway's public TCP proxy for the backup job.
- The free Supabase sign-in project pauses after a week without activity; new sign-ins fail until it is restored.
- The Google consent screen stays in Testing mode: only listed test users can sign in.
