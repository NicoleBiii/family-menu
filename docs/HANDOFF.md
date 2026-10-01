# Current State and Handoff

Updated: 2026-10-01 by Codex. Remote: private `github.com/NicoleBiii/family-menu`.
INFRA-001 PR #10 merged as `725a397`; the new-service runbook correction merged in PR #12 as `03a01e6`. The owner reports the Railway app service is `Active` in `staging` at `https://family-menu-staging.up.railway.app`. External checks returned HTTP 200 from `/` and HTTP 200 with `{"status":"ready"}` from `/api/health/ready` on 2026-10-01. The owner reports all six product smoke steps passed; deployment identity and device/browser details remain pending ([record](verification/2026-10-01-infra-001-staging.md)).
Latest implementation commit: `725a397`. The owner smoke update is on `codex/staging-smoke-results`; verify the current checkout claim with `npm run handoff:status`.

The 2026-10-01 documentation-only update checked Prettier and `git diff --check`. The full local `npm run check` was not repeated; PR CI is the merge gate.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, CI/container config, handover tooling.
- AUTH-001 (`33a01a7`, closed `e5bf9c8`): Google sign-in through Supabase Auth with server-side PKCE, HttpOnly app sessions, CSRF, households, owner-only single-use invitations, join/remove/leave, mobile UI. [ADR 0002](decisions/0002-auth-sessions.md). Real-provider smoke passed.
- INFRA-001 partial: private GitHub repository, hosted CI passing, Dependabot triaged (Actions bumps merged; TypeScript and `@types/node` majors ignored), and Railway preview configuration merged in PR #10.
- REC-001 (`c902126` recipes, then photos): household recipes with structured ingredients, 12 curated presets (owner-accepted), shared editing with revision conflicts, idempotent create, archive/restore, and one photo per recipe stored as small WebP in PostgreSQL. [ADR 0003](decisions/0003-recipes.md), [preset provenance](presets/PROVENANCE.md).
- ORD-001: meal orders for now or later, household-local scheduling with explicit DST handling, immutable recipe snapshots, shared editing with revision conflicts, idempotent submission and closing, audit events, Meals page and order editor. [ADR 0004](decisions/0004-meal-orders.md).
- SHOP-001: shopping demand from pending order snapshots with exact rational arithmetic (rounded up and flagged when inexact), fixed-family unit conversion, separate forms/counts/unquantified lines, combined and by-day views from one read, date-range scope, Shopping page. [ADR 0005](decisions/0005-shopping-list.md).
- AI-001: durable draft requests with worst-case cost reservations, household/personal/monthly-budget limits under one lock, leased in-process worker with recovery and no blind retries, review/edit/save/discard with idempotent save, Anthropic/DeepSeek/Gemini adapters, a measured three-provider evaluation, and Gemini 3.1 Flash-Lite chosen for now. [ADR 0006](decisions/0006-ai-drafts.md), [record](verification/2026-09-27-ai-001.md).
- UX-001 (automated part): axe WCAG 2.2 A/AA scans at 0 violations on all main screens, keyboard-only core flow at 360 px with focus never hidden behind the bottom navigation, session-expiry/offline/server-error messages, per-page titles. The real-phone and screen-reader checklist is open ([record](verification/2026-09-27-ux-001.md)).

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- AI: Gemini 3.1 Flash-Lite on a paid key for now (Claude Haiku 4.5 as the tested alternative); AI spend cap CAD 12/month (enforced as USD 8.50); API keys, not workload identity federation, for now.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

On the owner's Mac (Node 24.19.0, PostgreSQL 14.18): full `npm run check` passed on `ai-001` — 68 integration tests (PostgreSQL/API, provider stubs and pure calculation) and 46 desktop/mobile browser cases (including axe scans), plus format/lint/types/builds; OpenAPI regenerated. Evidence: [AI-001](verification/2026-09-27-ai-001.md), [UX-001](verification/2026-09-27-ux-001.md), [SHOP-001](verification/2026-09-26-shop-001.md), [ORD-001](verification/2026-09-26-ord-001.md), [REC-001](verification/2026-09-26-rec-001.md), [AUTH-001](verification/2026-09-26-auth-001.md), [provider smoke](verification/2026-09-26-auth-001-provider-smoke.md), [foundation](verification/2026-09-26-foundation.md). Hosted CI results are on the PRs and `main` runs.

On 2026-09-29, `npm ci --offline` and the full `npm run check` passed again on the merged INFRA-001 source plus this documentation update: 68 integration and 46 browser tests. The first check attempt was blocked by sandbox loopback `EPERM`; rerunning with permitted access to the isolated `family_menu_test` database passed. PR #10 Quality checks passed. No successful Railway deploy or staging smoke test is verified.

For the 2026-09-30 Railway runbook correction, Prettier and `git diff --check` passed. No application code changed; the full local `npm run check` was not repeated. PR #12 Quality checks passed before merge.

Not verified: the browser AI path with real sign-in and real Gemini; forced membership-removal interleaving; real iPhone HEIC upload; rate limiting (except AI quotas); physical phone; screen reader. Google's provider-denial path is stub-only.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

The Mac's project PostgreSQL is listening at 127.0.0.1:55432 (data in ignored `.local/pgdata`). No application service was left running by this session. Migrations through 006 were applied to both `family_menu_test` and the development database `family_menu` on 2026-09-27. The owner's `.env` sets `AI_PROVIDER=gemini` with a paid key; `AI_PROVIDER=mock` works without any key (the default is off). The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Open owner decisions

- **Railway setup:** decided (Railway Hobby + Railway PostgreSQL, separate Gemini key with a USD 2 budget); account creation and billing are the owner's steps.
- Branch protection needs GitHub Pro (about USD 4/month) or a public repository. Until then the PR-plus-CI rule is a convention only.

## Next exact work

1. Record the device/browser used for the six passed smoke steps, deployed commit, Railway deployment ID and pre-deploy migration result from the Railway deployment details. Keep keys, cookies and invitation tokens out of the record.
2. Collect the owner's UI change requests while the staging experience is fresh; implement approved bounded UX changes before final regression. Complete the UX-001 real-phone, screen-reader and zoom checklist, then proceed to REL-001 recovery, alerts and release checks. INFRA-001 remains Ready for verification until its evidence gaps are closed.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
