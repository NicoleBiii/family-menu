# Current State and Handoff

Updated: 2026-09-26. Branch: main.
Current owner after planned closeout: none; run `npm run handoff:status` to verify.
Latest implementation checkpoint: see the foundation commit in `git log`; the final closeout will record its identifier.

## Completed local scope

ENG-001's local foundation is implemented: npm workspaces, Node 24.19.0, NestJS 12, React/Vite, TypeScript 6, Kysely/PostgreSQL, migrations, health/readiness/OpenAPI, an English mobile sample menu, local test commands, prepared CI/container configuration, and shared agent handover tooling.

The repository root is the `family-menu` directory. It is a separate Git repository inside the parent local ChatGPT-project workspace. The sibling `service-website-planning` folder is archived. Open this repository directly in Codex or Claude Code; do not maintain two active source copies.

There is no remote repository or cloud deployment. This local Git history is not an off-machine backup.

## Confirmed product constraints

- Mobile-first household menu and recipe management.
- All household members can edit the shared menu and each other's pending orders.
- v1 sources: manual recipes, presets, and quota-limited text AI drafts with explicit save/discard.
- Ordering/scheduling, two shopping views, completion/history.
- Defer wallets, paid memberships, social imports, grocery checkout, and completed-meal photos.
- English project artifacts; Chinese discussion and Unicode recipe input.
- Target first release around 2026-10-16; preferred operating budget below CAD 100/month.

## Verified state

After a clean lockfile installation, `npm run check` passed in full on 2026-09-26: formatting, lint, type checks, builds, 5 PostgreSQL/API integration tests, and 6 desktop/mobile browser tests. OpenAPI generation succeeded; runtime dependency audit reported zero known vulnerabilities at query time. A second agent claim and a wrong-agent release were both refused. See [verification evidence](verification/2026-09-26-foundation.md).

The host used PostgreSQL 14.18. CI and Compose target 17 but have not run. Docker is absent. GitHub CI, branch protection and secret scanning are not activated merely by the workflow file. No authenticated business behavior, real model calls, cloud cost measurements, or recovery drill has been performed.

## Running local services at handover

- Built preview: http://127.0.0.1:3000, started by the outgoing agent for inspection.
- Project-only PostgreSQL: 127.0.0.1:55432, with dev/test databases and data under ignored `.local/pgdata`.
- Browser-test server at port 4173 has stopped after tests.
- These processes may end with the environment; check before starting duplicates. Stop the preview process when needed; stop only the project database with `npm run db:stop`.
- This machine's default Node is 23, so select Node 24.19.0 before running npm. The outgoing agent used the bundled runtime described in ignored `.local/MACHINE.md`; standard Node 24 setup is documented in README.

## Next exact work

1. Follow [AGENT_HANDOVER.md](AGENT_HANDOVER.md), inspect Git status/diff and claim AUTH-001.
2. Read [ADR 0001](decisions/0001-foundation.md) and the access criteria in MVP_SPEC.md.
3. Implement the selected Google/Supabase session boundary and household membership/invitation API. Keep authorization server-side, with cross-household, revoked membership, CSRF, callback and expiry tests. Do not expose current tables directly to a browser or add a production fake-login bypass.
4. Provider-backed verification requires the owner's selected Supabase project and Google OAuth configuration. Continue local implementation and deterministic boundary tests where possible; clearly separate those from real-provider checks.
5. INFRA-001 separately needs remote repository destination/visibility and provider setup before hosted CI/staging. Do not buy services or publish code solely because a configuration file exists.

## Switching agents

AGENTS.md is canonical; CLAUDE.md imports it. Stop the current agent before starting another writer. If a limit stops the outgoing agent unexpectedly, preserve uncommitted changes, inspect actual state, and confirm the previous agent is stopped before releasing a stale claim. Plain Claude web chat needs explicitly supplied repository access or a source archive.

## Reusable continuation prompt

> Continue Family Menu with AUTH-001. Read AGENTS.md, docs/HANDOFF.md, docs/PLAN.md, docs/MVP_SPEC.md and docs/decisions/0001-foundation.md. Verify the Git branch, latest commit, working diff and checkout claim before editing. Keep maintained content in English and discuss with me in Chinese. Use the locked toolchain and existing scripts. Preserve all-member editing of pending household orders and the confirmed MVP deferrals. Implement real session and household boundaries, with negative tests; distinguish local verification from provider-backed verification. Update the work log, plan and handoff with actual evidence before yielding.
