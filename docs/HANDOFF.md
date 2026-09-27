# Current State and Handoff

Updated: 2026-09-26 by Claude. Remote: private `github.com/NicoleBiii/family-menu`.
ORD-001 is on branch `ord-001`, PR https://github.com/NicoleBiii/family-menu/pull/6. Squash-merge it once its CI passes; if CI fails, fix on the branch first. Check `gh pr view 6` before starting SHOP-001 from `main`. Changes now reach `main` only through PRs with green CI (AGENTS.md); GitHub cannot enforce this on the free private plan.
Checkout claim after closeout: none; verify with `npm run handoff:status`.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, CI/container config, handover tooling.
- AUTH-001 (`33a01a7`, closed `e5bf9c8`): Google sign-in through Supabase Auth with server-side PKCE, HttpOnly app sessions, CSRF, households, owner-only single-use invitations, join/remove/leave, mobile UI. [ADR 0002](decisions/0002-auth-sessions.md). Real-provider smoke passed.
- INFRA-001 partial: private GitHub repository, hosted CI passing, Dependabot triaged (Actions bumps merged; TypeScript and `@types/node` majors ignored).
- REC-001 (`c902126` recipes, then photos): household recipes with structured ingredients, 12 curated presets (owner-accepted), shared editing with revision conflicts, idempotent create, archive/restore, and one photo per recipe stored as small WebP in PostgreSQL. [ADR 0003](decisions/0003-recipes.md), [preset provenance](presets/PROVENANCE.md).
- ORD-001: meal orders for now or later, household-local scheduling with explicit DST handling, immutable recipe snapshots, shared editing with revision conflicts, idempotent submission and closing, audit events, Meals page and order editor. [ADR 0004](decisions/0004-meal-orders.md).

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

On the owner's Mac (Node 24.19.0, PostgreSQL 14.18): full `npm run check` passed after ORD-001 — 45 PostgreSQL/API integration tests and 26 desktop/mobile browser cases, plus format/lint/types/builds; OpenAPI regenerated. Evidence: [ORD-001](verification/2026-09-26-ord-001.md), [REC-001](verification/2026-09-26-rec-001.md), [AUTH-001](verification/2026-09-26-auth-001.md), [provider smoke](verification/2026-09-26-auth-001-provider-smoke.md), [foundation](verification/2026-09-26-foundation.md). Hosted CI results are on the PRs and `main` runs.

Not verified: forced membership-removal interleaving; real iPhone HEIC upload; rate limiting; physical phone; screen reader. Google's provider-denial path is stub-only.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

None left running by Claude. The Mac's project PostgreSQL (127.0.0.1:55432, data in ignored `.local/pgdata`) is left running. Migrations 003–005 are applied to `family_menu_test` only; run `npm run db:migrate` for the development database before using the dev server. The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Open owner decisions

- Branch protection needs GitHub Pro (about USD 4/month) or a public repository. Until then the PR-plus-CI rule is a convention only.

## Next exact work

1. SHOP-001 (ingredient calculation and two shopping views, AC-09/AC-10): create branch `shop-001`, claim it, read MVP_SPEC "Shopping-list calculation". Compute from pending order snapshots only (`meal_order_items.ingredients` carries `key`, exact `quantity`, `unit`, `form`; required = quantity × servings ÷ recipe_servings) in one consistent read. Use exact decimal arithmetic, fixed conversions only (g/kg, ml/l; decide tsp/tbsp/cup explicitly), keep count, unit-less and unquantified lines separate. Include the 500 g chicken fixture and household isolation tests.
2. INFRA-001: isolated preview deployment.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
