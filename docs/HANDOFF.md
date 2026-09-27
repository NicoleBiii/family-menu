# Current State and Handoff

Updated: 2026-09-26 by Claude. Remote: private `github.com/NicoleBiii/family-menu`.
ORD-001 (PR #6, `d3990c7`) and SHOP-001 (PR #7, `042060d`) are merged. UX-001 is on branch `ux-001` with its own PR; squash-merge it once CI passes (check `gh pr list`).
Checkout claim after closeout: none; verify with `npm run handoff:status`.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, CI/container config, handover tooling.
- AUTH-001 (`33a01a7`, closed `e5bf9c8`): Google sign-in through Supabase Auth with server-side PKCE, HttpOnly app sessions, CSRF, households, owner-only single-use invitations, join/remove/leave, mobile UI. [ADR 0002](decisions/0002-auth-sessions.md). Real-provider smoke passed.
- INFRA-001 partial: private GitHub repository, hosted CI passing, Dependabot triaged (Actions bumps merged; TypeScript and `@types/node` majors ignored).
- REC-001 (`c902126` recipes, then photos): household recipes with structured ingredients, 12 curated presets (owner-accepted), shared editing with revision conflicts, idempotent create, archive/restore, and one photo per recipe stored as small WebP in PostgreSQL. [ADR 0003](decisions/0003-recipes.md), [preset provenance](presets/PROVENANCE.md).
- ORD-001: meal orders for now or later, household-local scheduling with explicit DST handling, immutable recipe snapshots, shared editing with revision conflicts, idempotent submission and closing, audit events, Meals page and order editor. [ADR 0004](decisions/0004-meal-orders.md).
- SHOP-001: shopping demand from pending order snapshots with exact rational arithmetic (rounded up and flagged when inexact), fixed-family unit conversion, separate forms/counts/unquantified lines, combined and by-day views from one read, date-range scope, Shopping page. [ADR 0005](decisions/0005-shopping-list.md).
- UX-001 (automated part): axe WCAG 2.2 A/AA scans at 0 violations on all main screens, keyboard-only core flow at 360 px with focus never hidden behind the bottom navigation, session-expiry/offline/server-error messages, per-page titles. The real-phone and screen-reader checklist is open ([record](verification/2026-09-27-ux-001.md)).

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

On the owner's Mac (Node 24.19.0, PostgreSQL 14.18): full `npm run check` passed after UX-001 — 52 integration tests (PostgreSQL/API plus pure calculation) and 40 desktop/mobile browser cases (including axe scans), plus format/lint/types/builds; OpenAPI regenerated. Evidence: [UX-001](verification/2026-09-27-ux-001.md), [SHOP-001](verification/2026-09-26-shop-001.md), [ORD-001](verification/2026-09-26-ord-001.md), [REC-001](verification/2026-09-26-rec-001.md), [AUTH-001](verification/2026-09-26-auth-001.md), [provider smoke](verification/2026-09-26-auth-001-provider-smoke.md), [foundation](verification/2026-09-26-foundation.md). Hosted CI results are on the PRs and `main` runs.

Not verified: forced membership-removal interleaving; real iPhone HEIC upload; rate limiting; physical phone; screen reader. Google's provider-denial path is stub-only.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

None left running by Claude. The Mac's project PostgreSQL (127.0.0.1:55432, data in ignored `.local/pgdata`) is left running. Migrations through 005 are applied to both `family_menu_test` and the development database `family_menu` (applied with `npm run db:migrate` on 2026-09-26). The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Open owner decisions

- **AI-001 provider:** which model provider to evaluate first, whether an API account/key exists, and a monthly AI spend cap within the CAD 100 budget. AI-001 cannot start its real-provider part without this; a mock-provider implementation of the draft workflow (AC-06, AC-13) can.
- Branch protection needs GitHub Pro (about USD 4/month) or a public repository. Until then the PR-plus-CI rule is a convention only.

## Next exact work

1. Merge the UX-001 PR after CI passes.
2. If the owner has decided the AI provider: AI-001 on branch `ai-001` (MVP_SPEC "AI draft workflow"). Otherwise INFRA-001: isolated HTTPS preview deployment (needs the owner's hosting/account decisions per BUDGET.md), which also unblocks the UX-001 real-phone checklist.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
