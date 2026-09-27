# Current State and Handoff

Updated: 2026-09-26 by Claude. Branch: main. Remote: private `github.com/NicoleBiii/family-menu`.
Latest implementation commit: the REC-001 photos commit on `main` (check `git log`; it includes this handoff). Pushed to `origin/main` with the owner's approval.
Checkout claim after closeout: none; verify with `npm run handoff:status`.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, CI/container config, handover tooling.
- AUTH-001 (`33a01a7`, closed `e5bf9c8`): Google sign-in through Supabase Auth with server-side PKCE, HttpOnly app sessions, CSRF, households, owner-only single-use invitations, join/remove/leave, mobile UI. [ADR 0002](decisions/0002-auth-sessions.md). Real-provider smoke passed.
- INFRA-001 partial: private GitHub repository, hosted CI passing, Dependabot triaged (Actions bumps merged; TypeScript and `@types/node` majors ignored).
- REC-001 (`c902126` recipes, then photos): household recipes with structured ingredients, 12 curated presets (owner-accepted), shared editing with revision conflicts, idempotent create, archive/restore, and one photo per recipe stored as small WebP in PostgreSQL. [ADR 0003](decisions/0003-recipes.md), [preset provenance](presets/PROVENANCE.md).

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

On the owner's Mac (Node 24.19.0, PostgreSQL 14.18): full `npm run check` passed after REC-001 photos — 33 PostgreSQL/API integration tests and 20 desktop/mobile browser cases, plus format/lint/types/builds; OpenAPI regenerated; runtime audit 0 known vulnerabilities. Hosted CI passed on `main` through the recipes commit (run 36290461289). Evidence: [REC-001 verification](verification/2026-09-26-rec-001.md); earlier: [AUTH-001](verification/2026-09-26-auth-001.md), [provider smoke](verification/2026-09-26-auth-001-provider-smoke.md), [foundation](verification/2026-09-26-foundation.md).

Hosted CI (including the Docker build with `sharp`) passed on `7dccabf` (run 36290822821); the Node 20 Actions deprecation warning no longer appears.

Not verified: forced membership-removal interleaving; real iPhone HEIC upload; rate limiting; physical phone. Google's provider-denial path is stub-only.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

None left running by Claude. The Mac's project PostgreSQL (127.0.0.1:55432, data in ignored `.local/pgdata`) is left running. Migrations 003–004 are applied to `family_menu_test` only; run `npm run db:migrate` for the development database before using the dev server. The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Open owner decisions

None blocking. Branch protection on `main` (require the CI check) is recommended before more collaborators or agents push; enabling it changes repository settings and needs the owner's go-ahead.

## Next exact work

1. Start ORD-001 (orders, scheduling, snapshots, shared editing): claim it, read MVP_SPEC "Recipe and order semantics" and AC-03/04/07/08/11. Reuse `requireMember(..., lock = true)`, `expectedRevision` conflicts and client request ids from recipes. Order items snapshot the recipe's name, ingredients, steps, servings and price; archived recipes cannot be newly ordered. Add the minimal audit event table and cross-household negative tests.
2. INFRA-001: branch protection (with owner approval), then the isolated preview deployment.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
