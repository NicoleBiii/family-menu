# Current State and Handoff

Updated: 2026-09-26 by Claude. Branch: main.
Latest implementation commit: `33a01a7` (AUTH-001). HEAD is the documentation commit after it; check `git log`.
Checkout claim after closeout: none; verify with `npm run handoff:status`.

## Completed scope

- ENG-001 local foundation (`570d2c7`): npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, prepared CI/container config, handover tooling.
- AUTH-001 implementation (`33a01a7`), locally verified: Google sign-in through Supabase Auth using server-side PKCE, HttpOnly app sessions (hashed, 30-day absolute/14-day idle, logout, rotation), CSRF token + Origin check, households, owner-only single-use invitations, join, removal/leave, and the mobile UI. See [ADR 0002](decisions/0002-auth-sessions.md).

There is no remote repository or cloud deployment. Local Git history is not an off-machine backup.

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

Full `npm run check` passed after AUTH-001: 17 PostgreSQL/API integration tests and 12 desktop/mobile browser cases, plus format/lint/types/builds; runtime audit reported 0 known vulnerabilities. This ran in Claude's Linux cloud workspace (Node 24.19.0, PostgreSQL 16.13), not on the owner's Mac. Evidence: [AUTH-001 verification](verification/2026-09-26-auth-001.md); earlier: [foundation verification](verification/2026-09-26-foundation.md).

Not verified: real Google/Supabase (tests use a local stub of the Supabase Auth HTTP endpoints), this change on the Mac, hosted CI, Docker, rate limiting, physical phone.

## Real-provider smoke test

AUTH-001 is Done. Real Google/Supabase steps passed ([record](verification/2026-09-26-auth-001-provider-smoke.md)); the account chooser now always appears (`prompt=select_account`). Google's UI offers no explicit deny step for basic scopes, so the provider-denial path is verified only against the stub.

## Location

The repository lives at `/Users/bibi/Bibi_Dev/family-menu` (moved 2026-09-26 out of the ChatGPT project mirror under `~/.codex/.chatgpt-projects/`, whose files may be replaced by ChatGPT). Open this path directly in Codex or Claude Code. The old mirror still holds the archived `service-website-planning` folder and planning ZIPs; they are history only.

## Local services

None left running by Claude on the owner's machine. The Mac's project PostgreSQL (127.0.0.1:55432, data in ignored `.local/pgdata`) and any preview started earlier by Codex may or may not still be running; check before starting duplicates. The Mac's default Node is 23; use Node 24.19.0 (see ignored `.local/MACHINE.md`).

## Next exact work

0. INFRA-001 first step: push to a private GitHub repository (owner approved uploading on 2026-09-26), then check the first CI run.

1. If the owner has completed setup: run and record the real-provider smoke test; fix any provider mismatch (e.g. token response shape) with a test.
2. Otherwise start REC-001 (manual/preset recipes, private images): claim it, read MVP_SPEC recipe semantics and AC-05/AC-12, and scope every new table and route by `HouseholdsService.requireMember`. Extend the AC-02 cross-household test to recipes.
3. INFRA-001 still needs the remote repository destination/visibility decision before hosted CI/staging.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim.

## Reusable continuation prompt

> Continue Family Menu. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Every household-scoped route must use the existing membership check and gain cross-household negative tests. Update the work log, plan and handoff with actual evidence before yielding.
