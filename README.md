# Family Menu

A mobile-first shared menu for the people you call home: collect recipes, coordinate meals, and turn your plans into a shopping list.

**Status: early development, not a released service.** Google sign-in (through Supabase Auth), households, invitations and membership work and passed a real-provider smoke test ([setup](docs/SETUP_AUTH.md)). Households can save, edit, archive and restore their own recipes, starting from scratch or from 12 starter recipes, and add a photo to each. Members plan meal orders for now or later and edit, complete or cancel each other's pending orders, and the Shopping page adds up exactly what pending meals need, combined or by day. A household can ask for an AI recipe draft, review and edit it, then save or discard it. Limits per household, per person and on monthly spend are enforced; the AI provider has not been chosen yet (only a local mock is exercised in tests).

## What works today

- Google sign-in via server-side PKCE, HttpOnly app sessions with expiry/logout, CSRF protection.
- Create households, invite with single-use 7-day links, join, remove members or leave. All household routes are authorized on the server.
- Responsive React menu: starter recipes, the household's own recipes with search, recipe dialogs with focus restoration, a mobile recipe editor with structured ingredients, stale-edit conflict handling, and navigation empty states.
- NestJS application serving the production frontend and API from one origin.
- Separate liveness and database/schema readiness checks, request IDs, security headers, and a generated OpenAPI contract.
- PostgreSQL migrations for profiles, households, membership, sessions, login state and invitations in a private schema.
- Real-database integration tests and desktop/mobile browser tests.
- Versioned dependency lockfile, static checks, and a prepared GitHub Actions workflow.
- Shared instructions and an explicit handover workflow for alternating Codex and Claude Code.

## Requirements

- Node.js **24.19.0**, recorded in `.nvmrc`; use a Node version manager to select it before installing dependencies.
- npm 10 or 11; use npm only with `package-lock.json`.
- PostgreSQL binaries for the isolated local helper, or Docker Compose. The local foundation was verified on PostgreSQL 14.18; Compose/CI target PostgreSQL 17 and still require their first execution.

## Start locally

Run these commands from this repository root, not the old planning folder:

```sh
npm ci
cp .env.example .env
npm run db:local
npm run db:migrate
npm run dev
```

Open [the development frontend](http://127.0.0.1:5173). It proxies `/api` to the backend at port 3000. The local database helper creates an isolated cluster in `.local/pgdata`, bound to `127.0.0.1:55432`, with separate `family_menu` and `family_menu_test` databases. It does not modify the system database service. Stop it with `npm run db:stop`; its data is retained.

If using Docker instead of local PostgreSQL binaries, substitute `docker compose up -d --wait` for `npm run db:local`. Use one database method at a time because both use port 55432. The test database initialization runs only on a new Compose volume. The example password is a local-only development value and must never be used for a public database.

To run the built single-origin application:

```sh
npm run build
npm start
```

Open [the built preview](http://127.0.0.1:3000). Stop the development server first if it is using the same port.

## Verify

```sh
npx playwright install chromium
npm run check
npm run openapi
npm audit --omit=dev --audit-level=high
```

`check` runs format checks, lint, type checks, production builds, real PostgreSQL integration tests, and browser tests. Tests refuse to use a non-loopback database or a database not named `family_menu_test`. They do not silently skip database verification. The browser tests need port 4173 free; they start/stop their own built application.

Integration coverage checks migrations and constraints, health/contract endpoints, redacted database failure, configuration, and the AUTH-001 boundary: login state/PKCE failures, session expiry/revocation, CSRF, cross-household access (404), and invitation expiry/revocation/single use. The Supabase Auth endpoints are replaced by a local stub in tests; the real provider needs the manual smoke test in [SETUP_AUTH.md](docs/SETUP_AUTH.md).

Browser coverage exercises starter-recipe search/empty results, recipe dialogs and focus, navigation, a 360 px mobile layout, API-versus-SPA fallback, recipe create/edit/archive/restore, saving a starter copy, the stale-edit conflict path, and a two-user sign-in → invite → join → remove flow through the provider stub (`tests/e2e/provider-stub.mjs`, started only by Playwright). A browser viewport is not a physical-device test.

## Useful endpoints

| Route               | Behavior                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| `/api/health/live`  | Process liveness; remains available if the database fails                   |
| `/api/health/ready` | Database and foundation schema readiness; returns a redacted 503 on failure |
| `/api/openapi.json` | Current API contract                                                        |
| `/api/auth/*`       | Google sign-in start/callback, current session + CSRF token, logout         |
| `/api/households`   | Session-authenticated households, members and invitations                   |

`docs/api/openapi.json` is generated. Regenerate it after API changes rather than editing it by hand.

## Repository map

```text
apps/api/                 NestJS backend
apps/web/                 React/Vite frontend
db/migrations/            Forward database changes
scripts/                  Migration, local DB, agent handover utilities
tests/integration/        Real PostgreSQL and HTTP tests
tests/e2e/                Desktop/mobile browser tests
docs/                     Requirements, decisions, evidence, handoff
.github/workflows/ci.yml   Prepared CI checks and container build
```

The stack uses NestJS 12, React 19, Vite 8, TypeScript 6 and Kysely with PostgreSQL. Exact versions live in package manifests and the lockfile. See [the engineering decision](docs/decisions/0001-foundation.md) for rationale and limitations.

## Codex ↔ Claude Code handover

Both agents use [AGENTS.md](AGENTS.md). [CLAUDE.md](CLAUDE.md) imports it. Start with [the current handoff](docs/HANDOFF.md) and follow [the handover procedure](docs/AGENT_HANDOVER.md).

```sh
npm run handoff:status
npm run handoff:claim -- claude AUTH-001
# Work, verify, update docs, and save a Git checkpoint.
npm run handoff:release -- claude
```

Use `codex` instead of `claude` for the other agent. Claims are advisory and local to one checkout. If a usage limit interrupts a session, inspect the actual Git diff and confirm the previous agent has stopped before releasing a stale claim. Do not discard unfinished work.

## Deployment status

A Dockerfile has passed the CI image start check. The private GitHub repository is connected to a Railway app service in `staging`, but no successful Railway deployment is verified. Railway no longer accepts `railway.json` for newly created services; configure the pre-deploy migration and readiness check in the service Settings using [deployment setup](docs/DEPLOYMENT.md). The local host has no Docker installation, so the container build is unverified locally.

Before any cloud release, follow [deployment setup](docs/DEPLOYMENT.md). A workflow file alone does not enable branch protection, secret scanning, or an enforced release gate. The current implementation is a foundation; do not present it as a production-ready household service.

## Project records

- [Product brief](docs/PROJECT_BRIEF.md)
- [Confirmed MVP and acceptance criteria](docs/MVP_SPEC.md)
- [Plan and backlog](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operating budget](docs/BUDGET.md)
- [Work log](docs/WORK_LOG.md)
- [Foundation verification evidence](docs/verification/2026-09-26-foundation.md)
- [AUTH-001 verification evidence](docs/verification/2026-09-26-auth-001.md)
- [Google sign-in setup](docs/SETUP_AUTH.md)

This repository is now the authoritative working copy. It lives at `/Users/bibi/Bibi_Dev/family-menu` on the owner's machine; the earlier `service-website-planning` directory and dated ZIP files remain in the old ChatGPT project mirror as historical planning snapshots. Project content is English-first; recipe input will support Unicode. No public software licence has been selected yet.
