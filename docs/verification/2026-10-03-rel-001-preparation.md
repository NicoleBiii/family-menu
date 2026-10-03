# REL-001 Preparation — 2026-10-03

Scope: the agent-side preparation for the first family release under [ADR 0010](../decisions/0010-production-environment.md). This covers the restricted runtime database login, the restore drill tooling with a local rehearsal, and the production runbook. No production resources exist yet. Branch `claude/rel-001-production`, based on `main` at `08307a2`.

## Restricted runtime login

| Check                                    | Evidence                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The app works with row-level rights only | The integration harness now runs the API as `family_menu_app_test`, created by `scripts/runtime-role.mjs`: all 90 integration tests pass. The browser suite's server runs migrate → role → server like Railway's pre-deploy: 82/82 pass    |
| No schema changes or audit rewriting     | `runtime-role.test.mjs`: no CREATE on `app`; not a superuser, and no role or database creation. CREATE TABLE, ALTER, DROP, UPDATE/DELETE on `app.audit_events` and TRUNCATE all fail with 42501; API requests still append audit rows      |
| Repeatable and safe input                | Rerunning without a password keeps the login working. Unsafe role names, short passwords and creating without a password are rejected                                                                                                      |
| Image                                    | The Dockerfile copies `scripts/runtime-role.mjs` and `certs/`. CI's image step now runs both pre-deploy scripts and starts the server as a restricted role. Docker is not installed on the owner's Mac, so this is first verified by PR CI |

## Restore drill rehearsal (local, synthetic data)

`npm run restore:drill` with the loopback `family_menu_test` database as the source and the same local PostgreSQL 14.18 server as the drill server. It dumps the `app` schema and the migration bookkeeping separately, restores them into a new `family_menu_restore_drill` database, compares, then drops it and deletes the dumps:

```
latestMigration 20261002_009_photo_library_credit · 16 tables · 31,742 rows · 202 photos
dump 0.3 s · restore 0.2 s · result: match
```

A negative check (one photo deleted from the restored copy) reported `app.recipe_images: 202 rows vs 201` and `photo bytes differ`, exiting 1. The first attempt failed because dumping all of `public` recreated an existing schema; the drill now dumps only the two Kysely migration tables from `public`. Passwords go to the tools through `PGPASSWORD`, not command-line arguments.

## Not yet done (owner steps, then agent records)

- Production Supabase Pro project, Railway `production` environment, `release` branch and first deployment (DEPLOYMENT.md P1–P2).
- UptimeRobot monitor and alert-delivery drill (P3).
- Production smoke test, the real restore drill with PostgreSQL 17 tools, and the release record (P4).
- The Supabase CA certificate file `certs/supabase-ca.crt`.

## Checks run

On the owner's Mac with Node 24.19.0 and the loopback `family_menu_test` database: full `npm run check` passed, with format, lint, typechecks, production builds, 90/90 integration tests (2 new) and 82/82 desktop/mobile browser cases, all with the API running as the restricted role.
