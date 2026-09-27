# Current State and Handoff

Updated: 2026-09-26 by Claude. Branch: main. Remote: private `github.com/NicoleBiii/family-menu`.
Latest implementation commit: the REC-001 recipes commit (check `git log`; HEAD may include this handoff in the same commit). Local `main` may be ahead of `origin/main` until the owner approves a push.
Checkout claim after closeout: none; verify with `npm run handoff:status`.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, CI/container config, handover tooling.
- AUTH-001 (`33a01a7`, closed `e5bf9c8`): Google sign-in through Supabase Auth with server-side PKCE, HttpOnly app sessions, CSRF, households, owner-only single-use invitations, join/remove/leave, mobile UI. [ADR 0002](decisions/0002-auth-sessions.md). Real-provider smoke passed.
- INFRA-001 partial: private GitHub repository; first hosted CI run on `main` passed (run 36289153638).
- REC-001 partial (recipes): household recipes with structured ingredients, 12 curated presets, shared editing with revision conflicts, idempotent create, archive/restore, Menu UI and editor. [ADR 0003](decisions/0003-recipes.md), [preset provenance](presets/PROVENANCE.md).

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

On the owner's Mac (Node 24.19.0, PostgreSQL 14.18): full `npm run check` passed after REC-001 recipes — 27 PostgreSQL/API integration tests and 18 desktop/mobile browser cases, plus format/lint/types/builds; OpenAPI regenerated; runtime audit 0 known vulnerabilities. Evidence: [REC-001 verification](verification/2026-09-26-rec-001.md); earlier: [AUTH-001](verification/2026-09-26-auth-001.md), [provider smoke](verification/2026-09-26-auth-001-provider-smoke.md), [foundation](verification/2026-09-26-foundation.md).

Not verified: hosted CI for the REC-001 commit (not pushed yet), recipe images (not built), forced membership-removal interleaving, Docker, rate limiting, physical phone. Google's provider-denial path is stub-only.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

None left running by Claude. The Mac's project PostgreSQL (127.0.0.1:55432, data in ignored `.local/pgdata`) was running and is left running. Migration 003 has been applied to `family_menu_test` only; run `npm run db:migrate` for the development database before using the dev server. The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Open owner decisions

1. **Recipe image storage (AC-12)** — private Supabase Storage (needs a server-side secret key, bucket and signed URLs) or size-limited re-encoded images in PostgreSQL served by the API. Either needs an image-processing dependency (e.g. `sharp`). See ADR 0003.
2. **Dependabot PRs** — recommended: merge the three Actions bumps (#1–#3, CI green, clears the Node 20 deprecation warning); close #4 (`@types/node` 26 ≠ Node 24 runtime) and #5 (TypeScript 7 breaks typescript-eslint and Nest OpenAPI, per ADR 0001), and consider Dependabot ignore rules for those majors.
3. **Push** the REC-001 commit to `origin/main` so CI runs on it.
4. Review the 12 preset texts (docs/presets/PROVENANCE.md).

## Next exact work

1. After decision 1: finish REC-001 images — claim REC-001, add the storage path with type/size/dimension validation and metadata stripping, household-scoped access, and AC-12 tests including cross-household image access.
2. If images are deferred: start ORD-001 (orders, scheduling, snapshots, shared editing) — AC-03/04/07/08/11. Reuse the `requireMember(..., lock = true)` + `expectedRevision` pattern from recipes; order items snapshot recipe content.
3. INFRA-001: branch protection requiring the CI check, then the isolated preview deployment.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
