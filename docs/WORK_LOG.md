# Work Log and Decisions

Use dates in YYYY-MM-DD format, with America/Toronto as the reporting timezone. Preserve history; add corrections or superseding entries rather than rewriting decisions silently.

## 2026-09-25 — Kickoff scaffold

- Request: begin a planned, recorded development process; establish English-first artifacts for a Toronto job search; explain whether another conversation or separate language repositories are needed.
- Created: a local planning starter with a brief, milestone plan, backlog, working agreement, task template, and handoff.
- Confirmed: project content should primarily use English.
- Not determined: service domain, target role, skills, scope, weekly availability, deadline, budget, stack, repository destination, and visibility.
- No application was implemented or deployed. No remote repository was created. No product tests, CI runs, security review, or recovery exercise have occurred.
- Next action: collect discovery input and complete PROJECT_BRIEF.md.

## Decisions

### DEC-001 — English-first artifacts

- Status: confirmed by the owner's stated preference on 2026-09-25.
- Decision: maintained project content should primarily use English. Chinese discussion remains acceptable.
- Reason: the owner wants project material suitable for a Toronto job search.
- Implication: public-facing project claims and explanations should be clear and independently understandable in English.

### DEC-002 — One repository per product

- Status: proposed.
- Recommendation: keep one source of truth for code and engineering history. If useful, put an optional Chinese README in the same repository. Use localization files for a bilingual application.
- Reason: separate language repositories duplicate code, issues, fixes, and release history.
- Revisit if: the products actually become independently maintained systems with different owners or requirements.

### DEC-003 — Dedicated development project after discovery

- Status: proposed.
- Recommendation: use this local folder for initial planning, then copy the documents to a dedicated development project and establish Git history there.
- Reason: the current parent folder is a local mirror of a broader ChatGPT project; it should not be assumed to provide product version control or automatic remote backup.
- Open decisions: final project name, location, remote provider, and repository visibility.

## Future session entry template

### YYYY-MM-DD — Task ID and outcome

- Goal:
- Changes or findings:
- Validation actually performed and evidence:
- Not verified / limitations:
- Decisions made, with rationale and confirmation status:
- Remaining work:
- Next task:
- Commit or PR link, once available:

## 2026-09-25 — Product discovery and v0.1 scope

- Owner input: target backend/full-stack roles; strongest professional framework NestJS; broader experience with small projects and REST APIs.
- Product selected: mobile-first household menu and recipe management with household meal ordering, editable orders, scheduling, shopping-list aggregation, and history.
- Problem evidence: owner-reported friction in existing menu/recipe products; no independent competitor study has been conducted.
- Constraints: flexible availability, desired first release in three weeks, preferably below CAD 100/month. The date 2026-10-16 assumes work starts on 2026-09-25.
- Owner explicitly selected all-household-member editing of each other's orders.
- Owner explicitly accepted presets, manual entry, quota-limited text AI drafts, and virtual display prices for v1, with wallets/allocations, paid membership, social-link import, grocery checkout, and meal photos deferred.
- Updated: README, working agreement, project brief, three-week plan/backlog, and handoff.
- Added: MVP_SPEC.md with acceptance cases, ARCHITECTURE.md with recommended boundaries, and BUDGET.md with current official pricing sources and a CAD 85 planning allocation.
- Technical defaults are proposals: order snapshots, optimistic concurrency, compatible-unit ingredient aggregation, private storage, managed auth/database, and an invite-only beta. They are not quoted as additional user requests.
- Evidence performed: official provider pricing/auth/backup/cost-control documentation reviewed; local document verification is recorded in the validation entry below.
- Not performed: product implementation, runtime tests, cloud provisioning, actual AI cost evaluation, CI execution, security certification, user interviews, or recovery exercises.
- Next task: ENG-001 — establish the dedicated development repository and reproducible foundation.

### DEC-004 — Collaborative orders

- Status: confirmed by owner response on 2026-09-25.
- Decision: all household members may edit each other's orders; shared menu editing is also allowed.
- Implementation recommendation: restrict mutability to pending orders in v1 and reject stale revisions to prevent silent overwrites. Terminal-state behavior is a documented design default.

### DEC-005 — First-release scope

- Status: confirmed by owner response on 2026-09-25.
- Decision: ship presets, manual recipes, and limited text AI drafts; retain virtual display prices. Defer balances/allocations, paid membership, social imports, grocery checkout, and meal photos.
- Reason: preserve the core onboarding and household-ordering proposition within the desired three-week release window.

### DEC-006 — Proposed engineering baseline

- Status: recommended, not implemented or purchased.
- Recommendation: NestJS + mobile-first React/TypeScript + PostgreSQL in one repository; evaluate Supabase auth/database/storage and Railway application hosting.
- Reason: use existing backend expertise and keep operations within the preferred budget. Keep business rules in NestJS rather than exposing household tables directly to browsers.
- Constraint: final runtime/library/provider versions and actual cost must be verified during implementation.

### DEC-007 — Text AI first, with application-enforced limits

- Status: quota-limited text AI confirmed; enforcement design recommended.
- Decision: no self-hosted model inference, generated images, or social-video processing in v1. Add atomic usage/cost reservations and a fallback to manual/preset recipes.
- Reason: constrain latency, cost, and first-release scope without requiring subscription billing.

### v0.1 document validation

- Verified all 10 expected Markdown documents exist and are nonempty.
- Checked 14 local document links and balanced fenced code blocks.
- Confirmed AC-01 through AC-15 identifiers exist in the specification.
- Reviewed current-state documents for stale discovery assumptions; preserved earlier history as historical entries.
- The dated v0.1 ZIP is a local snapshot, not a Git commit or remote backup. Archive integrity is checked when it is generated.

## 2026-09-26 — ENG-001 local foundation and alternating-agent handover

- Authorization: the owner asked to continue the engineering foundation and stated that Codex and Claude Opus may alternate when usage limits are reached.
- Created a dedicated local `family-menu` Git repository and copied the planning baseline into it. This repository is now authoritative; the earlier planning directory is marked archived at its entry point.
- Implemented npm workspaces with pinned Node 24.19.0, NestJS 12, React 19, Vite 8, TypeScript 6, Kysely and PostgreSQL.
- Added health/readiness routes, security headers, request IDs, OpenAPI generation, same-origin production frontend serving, initial private-schema household migrations, and an isolated local database helper.
- Added an English mobile sample shell with recipe search/filter/dialog interactions and honest empty states. No authenticated household business feature is claimed complete.
- Added format/lint/type/build checks, real PostgreSQL integration tests, browser tests, and prepared SHA-pinned GitHub Actions with runtime dependency audit and Docker build.
- Added Docker/Compose/Railway configuration and documented the unexecuted cloud/container gates.
- Shared AGENTS.md is imported from CLAUDE.md; added a local advisory claim utility, interrupted-session recovery instructions, and a current handoff.
- Verification: 5 integration tests and 6 browser cases passed; production builds and static checks passed; OpenAPI generated; runtime dependency audit reported zero known vulnerabilities at query time. The in-app browser was inspected at 360 x 780 with no horizontal overflow or reported console warnings/errors.
- Reproducibility: a clean offline `npm ci` from the lockfile succeeded. A subsequent full-gate attempt correctly stopped on formatting of newly added documentation; formatting is corrected before the final gate/checkpoint.
- Handover guard: a second Claude claim and a mismatched-agent release were both correctly refused while Codex owned ENG-001.
- Limits: no remote repository, hosted CI run, branch protection, provider login, cloud deployment, Docker execution, paid service, or production recovery test. See the dated verification document for the full boundary.
- Next: AUTH-001 (Google/session/household authorization) and INFRA-001 (selected remote and isolated provider setup).

### DEC-008 — One checkout, alternating agents

- Status: implemented in response to the owner's stated workflow.
- Both tools use the same rules, task records, lockfile and Git history. Only one active writer per checkout; claims are cooperative local guards, not distributed access control.
- Durable Git checkpoints and handoff records are required because a usage limit may interrupt final chat summaries.
- Plain Claude web chat does not automatically get local repository access; use Claude Code or explicitly transfer the current source and context.

### DEC-009 — Foundation toolchain

- Status: implemented; supersedes the unselected-toolchain portion of DEC-006.
- See `docs/decisions/0001-foundation.md` for runtime, query/migration, session-direction and tooling decisions.
- The initial TypeScript 7 selection was replaced with 6.0.3 to satisfy Nest OpenAPI support. Versions are pinned rather than relying on an unbounded latest install.

### ENG-001 final local gate

- After correcting documentation formatting, the full `npm run check` passed: format, lint, type checks, production builds, 5 integration tests and 6 browser cases. No checks were skipped.
- Local document links were verified. Remaining external setup is tracked separately as INFRA-001.

## 2026-09-26 — Codex → Claude handover and AUTH-001

- Codex stopped on a usage limit after staging the ENG-001 closeout but before committing. The owner confirmed the switch to Claude. Claude inspected the staged tree (no unstaged changes), committed it unchanged as `570d2c7`, released Codex's stale claim and claimed AUTH-001 (recovery path in AGENT_HANDOVER.md).
- Owner decisions this session: continue with AUTH-001 only; no Supabase project or Google OAuth client exists yet, so implement locally and provide setup guidance (docs/SETUP_AUTH.md).
- Claude worked in a Linux cloud workspace cloned from a Git bundle of this repository, because the owner-side shell had no Node 24/PostgreSQL. Commits were transferred back as a bundle and fast-forwarded; no files were edited in two places.
- Baseline `npm run check` passed there before changes (PostgreSQL 16.13; Chromium revision mapped as noted in the verification record).
- Implemented AUTH-001 (`33a01a7`): server-side PKCE sign-in, hashed sessions with expiry/rotation/logout, CSRF token + Origin check, household create/list/detail, owner-only single-use invitations, join, member removal and leaving, and the mobile UI for these.
- A new test found nothing wrong in production code but did expose a test-harness race (parallel sign-ins shared the stub's pending identity); sign-ins in that test are now sequential. A mutation check showed the concurrency test did not fail with the row lock removed, so acceptance now also uses a conditional claim update; this limitation is recorded in ADR 0002.
- Verification: full `npm run check` passed (17 integration, 12 browser cases); audit 0 known vulnerabilities; OpenAPI regenerated. See verification/2026-09-26-auth-001.md.
- Not done: real Google/Supabase smoke test, rate limiting, hosted CI. Next: owner creates accounts per SETUP_AUTH.md and runs the smoke test; then REC-001.

### DEC-010 — App sessions instead of provider tokens

- Status: implemented. See `docs/decisions/0002-auth-sessions.md`.
- Supabase Auth establishes identity only; the API issues its own HttpOnly session and discards provider tokens. This supersedes ADR 0001's allowance to store a provider refresh credential.
- Invitations are single-use, 7-day, owner-created links; the token travels in the URL fragment and only its hash is stored.

### AUTH-001 real-provider smoke test

- The owner configured Supabase + Google (Testing mode) and ran SETUP_AUTH.md §5 on her Mac: steps 1–5 passed.
- Step 6: after app sign-out, sign-in completed without any Google screen (Google SSO reusing the browser's account). App session revocation was correct. Added `prompt=select_account` so the account chooser always appears, which also lets family members switch accounts on a shared device. Full `npm run check` passed again (17 integration, 12 browser). Step 6 awaits re-test.

### AUTH-001 closed; repository relocation

- Step 6 re-test: the account chooser now appears every time. Back from the chooser correctly creates no session. Google offered no Cancel/deny screen for basic scopes even after revoking app access, so the denial path stays stub-verified. AUTH-001 marked Done.
- Owner decisions: move the repository to `/Users/bibi/Bibi_Dev/family-menu` so it is no longer inside the ChatGPT project mirror (whose AGENTS.md warns its files may be replaced), and allow uploading to GitHub (INFRA-001). Codex and Claude Code both open the new path directly; no tool configuration refers to the old path.

## 2026-09-26 — INFRA-001 first hosted CI; REC-001 recipes and presets

- The private repository `NicoleBiii/family-menu` already existed with `main` at `e5bf9c8` pushed. Its first CI run on `main` passed (run 36289153638, 2m26s). GitHub warned that the pinned `actions/checkout` and `actions/setup-node` target the deprecated Node 20 runtime.
- Dependabot opened five PRs; none were merged. The Actions bumps (#1–#3) pass CI and would clear the Node 20 warning. #4 (`@types/node` 26) passes CI but mismatches the Node 24 runtime. #5 (TypeScript 7) fails `npm ci` on the typescript-eslint peer range, consistent with ADR 0001's TypeScript 6 decision. These need the owner's decision.
- Claude claimed REC-001 on the owner's Mac. Baseline `npm run check` passed there first (17 integration, 12 browser).
- Implemented recipes: migration 003 (`app.recipes`, `app.recipe_ingredients`), `RecipesService`/controllers, 12 curated presets as versioned code, OpenAPI update, Menu page with search/archived filter, recipe dialog and a mobile editor. Hardcoded sample recipes are gone; signed-out visitors see the real presets.
- `HouseholdsService.requireMember` gained an optional `FOR SHARE` lock, used by recipe writes, to close the membership-removal race.
- Shared integration sign-in helpers moved to `tests/integration/harness.mjs`.
- Verification: full `npm run check` passed (27 integration, 18 browser); mutation checks confirmed the conflict, isolation and idempotency tests fail when their guard is removed. A browser test found a real UI race (dialog reopening after close) that is now fixed. See verification/2026-09-26-rec-001.md.
- Not done: recipe images (AC-12), awaiting a storage decision; owner review of preset text.

### DEC-011 — Recipes and presets

- Status: implemented. See `docs/decisions/0003-recipes.md`.
- Presets are versioned read-only code with a public endpoint, copied into households with provenance; exact decimal quantities with a controlled unit list; full-replacement edits guarded by `expectedRevision`; client `requestId` makes creation idempotent; archive instead of delete.

## 2026-09-26 — Owner decisions; REC-001 photos; Dependabot triage

- Owner decisions: store recipe photos in PostgreSQL (dish photos need not be high resolution); push approved; Dependabot recommendation accepted; the 12 preset texts accepted as written.
- Pushed `c902126`. Squash-merged Dependabot #1–#3 (upload-artifact 7.0.1, checkout 7.0.1, setup-node 7.0.0); #3 needed a Dependabot rebase after #2. Closed #4 (`@types/node` 26) and #5 (TypeScript 7) with reasons, and added Dependabot ignore rules for those majors. Hosted CI passed on `main` after #2 (run 36290461289), which covers the recipes commit.
- Implemented photos (AC-12): migration 004 `app.recipe_images`, magic-byte type check, `sharp` re-encoding to ≤ 1024 px WebP without metadata, 5 MB upload limit, member-only serving with immutable ids, browser-side downsizing, card and dialog photos with add/change/remove.
- Test fixtures surfaced that sharp's `withExif` does not write orientation; the fixture now uses `withMetadata`. Production code was unaffected.
- Verification: full `npm run check` passed (33 integration, 20 browser); mutation checks for the magic-byte and household-scoping guards; audit 0 vulnerabilities. REC-001 marked Done.

### DEC-012 — Recipe photos in PostgreSQL

- Status: implemented; supersedes the private object-storage proposal in ARCHITECTURE.md. See ADR 0003.
- One normalized WebP per recipe in the database, served through the authorized API. Backups include photos; no bucket, secret key or separate file backup is needed.

## 2026-09-26 — Branch protection attempt; ORD-001 meal orders

- The owner approved branch protection. GitHub refused both classic branch protection and rulesets for this private repository on the free plan ("Upgrade to GitHub Pro or make this repository public"). Nothing was changed. AGENTS.md now requires both agents to reach `main` through a task branch and a PR with passing CI, by convention. Enforcement needs GitHub Pro or a public repository; the owner decides.
- ORD-001 on branch `ord-001`: migration 005 (`meal_orders`, `meal_order_items`, `audit_events`), `OrdersService`/controller, `Intl`-based local-time resolver with explicit DST gap/overlap handling, Meals page, order editor, and "Order" from a recipe dialog. `/meals` is now a routable page.
- Verification: full `npm run check` passed (45 integration, 26 browser); four mutation checks each failed only their intended test. See verification/2026-09-26-ord-001.md.

### DEC-013 — Meal orders

- Status: implemented. See `docs/decisions/0004-meal-orders.md`.
- Orders store the instant plus the household-local date/time and zone; DST-skipped times are rejected and repeated ones need an explicit choice. Items are immutable recipe snapshots; kept items keep them on edit. Closing is idempotent per target state. Every order mutation writes a minimal audit event.

### DEC-014 — PR workflow without enforcement

- Status: adopted in AGENTS.md. Supersedes direct pushes to `main` used earlier in this session.

## 2026-09-26 — ORD-001 merged; SHOP-001 shopping lists

- PR #6 (ORD-001) passed CI on its head commit `c9b68ea` and was squash-merged as `d3990c7`; the branch was deleted. Applied migrations 003–005 to the local development database with `npm run db:migrate`.
- SHOP-001 on branch `shop-001`: pure calculation module (`shopping.ts`, BigInt rationals, round-up display with an approximate flag, fixed unit families), one-statement read of pending order snapshots, `GET /api/households/:id/shopping` with optional date range, and the Shopping page (combined / by day, refresh on return, generated-at indicator). No schema change.
- Verification: full `npm run check` passed (52 integration, 28 browser); three mutation checks failed their intended tests. See verification/2026-09-26-shop-001.md.

### DEC-015 — Shopping calculation

- Status: implemented. See `docs/decisions/0005-shopping-list.md`.
- Exact rational arithmetic, rounded up only for display and flagged; conversions only inside fixed families (g/kg, ml/l, oz/lb, tsp/tbsp/cup); forms, counts and unquantified lines never merged; both views from one read.

## 2026-09-27 — SHOP-001 merged; UX-001 accessibility and states

- PR #7 (SHOP-001) passed CI on `8b5e2c1` and was squash-merged as `042060d`.
- UX-001 on branch `ux-001`. Acceptance criteria were written first (axe 0 violations, keyboard-only core flow at 360 px with unobscured focus, recoverable error states, page titles).
- Added dev dependency `@axe-core/playwright` 4.13.0 for automated WCAG 2.2 A/AA scans; it runs only in tests.
- Fixed: eight low-contrast grey text colours (now `#5c6557`); focused fields hidden behind the fixed bottom navigation (scroll padding); raw network/server errors; session expiry now returns to sign-in with an explanation; per-page titles.
- Verification: full `npm run check` passed (52 integration, 40 browser). The real-phone and screen-reader checklist in verification/2026-09-27-ux-001.md needs the owner and an HTTPS preview, so UX-001 is "Ready for verification", not Done.

## 2026-09-27 — UX-001 merged; AI-001 draft workflow with mock provider

- The owner merged PR #8 (UX-001) as `b390171`. AI-001 started on branch `ai-001`.
- Owner decisions: evaluate Claude Haiku 4.5, DeepSeek V4.1 Flash and Gemini 3.1 Flash-Lite before choosing; keep the AI budget at CAD 12/month; use API keys rather than workload identity federation for now.
- Price comparison gathered on 2026-09-27 from the providers' pages (USD per million input/output tokens): Claude Haiku 4.5 1/5, Sonnet 5 2/10; DeepSeek V4.1 Flash 0.30/1.20 at peak (half off-peak), V4 Pro 1.32/3.96; Gemini 3.1 Flash-Lite 0.25/1.50, 3.8 Flash 0.75/3.75 until 2026-12-31 then 1.50/7.50; OpenAI gpt-5-nano 0.05/0.40. DeepSeek stores data in the PRC and its JSON mode does not enforce a schema; Gemini's free tier uses content to improve products. Sources: api-docs.deepseek.com pricing, JSON-mode and privacy pages; platform.claude.com pricing; ai.google.dev pricing; developers.openai.com pricing.
- Implemented migration 006 (`ai_draft_requests`; recipe source `ai`), provider adapters (Anthropic SDK 0.128.0, DeepSeek and Gemini over REST, mock), `AiDraftsService` with locked admission, reservations, a leased in-process worker and recovery, the AI draft screen and editor review/save/discard, and `scripts/ai-eval.mjs` with 16 cases.
- Verification: full `npm run check` passed (68 integration, 46 browser); three mutation checks failed their intended tests. See verification/2026-09-27-ai-001.md. No real provider has been called.

### DEC-016 — AI drafts, quotas and provider evaluation

- Status: workflow implemented; model choice pending the evaluation. See `docs/decisions/0006-ai-drafts.md`.
- One durable row per request doubles as the cost reservation; admission checks household, personal and monthly-budget limits under one advisory lock; unknown outcomes keep the worst-case reservation; no automatic retries; drafts reach the menu only through an explicit, idempotent save.

## 2026-09-28 — AI-001 provider evaluation

- The owner ran `npm run ai:eval` with real keys (2026-09-27): Haiku 14/16, DeepSeek 16/16, Gemini free tier 15/16 schema-valid. All three failures were the same near-miss (unit without an amount, or the text "null" as a quantity).
- With the owner's approval: `validateDraft` now repairs those near-misses without inventing amounts, the prompt says a to-taste line has both quantity and unit null, and the evaluation was re-run (about USD 0.08): Haiku 16/16, DeepSeek 14/16 (a unit outside the list; one invalid JSON reply), Gemini free tier 2/16 (errors before any token, probably rate limits).
- The owner prepaid Gemini (paid tier); a Gemini-only re-run passed 16/16. The evaluation script now records the error status and accepts `--delay-ms`.
- Results are in ADR 0006 and `docs/verification/ai-eval/`. Open: the owner's usable-draft review and the model choice.
- Owner's usable-draft review: Anthropic 16/16, Gemini (paid) 16/16, DeepSeek 14/16.

### DEC-017 — AI provider for now: Gemini 3.1 Flash-Lite (paid tier)

- Status: owner decision, 2026-09-28. Recorded in ADR 0006; Claude Haiku 4.5 is the tested alternative. Production requires a paid Gemini key.
- Local `.env` now sets `AI_PROVIDER=gemini` (ignored file). A real Gemini draft passed through the service, database, worker, validation and save (2.6 s, 763 micro-USD).

## 2026-09-28 — AI-001 merged; INFRA-001 Railway preview preparation

- The owner merged PR #9 (AI-001) as `e8c8b92`. INFRA-001 on branch `infra-001`.
- Owner decisions: the preview runs on Railway Hobby with Railway PostgreSQL; sign-in stays on the Supabase development project; AI drafts use a separate Gemini key (`family-menu-staging`) with `AI_MONTHLY_BUDGET_USD=2`.
- `railway.json` runs `node scripts/migrate.mjs` as the pre-deploy command. Railway documents that pre-deploy commands run once per deploy in a separate container with the service's variables and private network, and that a failure stops the deploy (docs.railway.com, pre-deploy command guide). CI now starts the built image: migration against a fresh database, readiness, and page load.
- The DEPLOYMENT.md runbook lists the owner's account steps, the variables and the limitations: one database credential (the pre-deploy step shares runtime variables), unverified backups, usage alerts only.

### DEC-018 — Railway preview

- Status: owner decision; configuration prepared, deployment pending the owner's Railway account. Synthetic data only. A restricted runtime login, verified backups and a separate production environment are prerequisites for real households (REL-001).

## 2026-09-29 — INFRA-001 merged; Railway setup pending

- Resumed from the clean `infra-001` checkout with no active handoff claim. Verified PR #10 was merged on 2026-09-28 as `725a397`, with its Quality checks passing (GitHub Actions run 36474253128). Fast-forwarded local `main` to that merge commit.
- The owner confirmed that no Railway preview has been created. The GitHub deployments API returned no deployment records; that alone does not establish the state of the Railway account.
- Confirmed the next owner action is docs/DEPLOYMENT.md runbook steps 1–5. After the owner shares the public domain, the project can verify readiness, run the end-to-end smoke test, and continue UX-001 real-device checks.
- This entry only reconciles the handoff after the merge. No cloud deployment or provider smoke test is claimed.
- Verification on Node 24.19.0: `npm ci --offline` passed with zero reported vulnerabilities. The full `npm run check` passed (format, lint, types, builds, 68 integration tests against `family_menu_test`, 46 browser tests). Its first run hit sandbox `EPERM` on loopback PostgreSQL access; the permitted rerun passed. `git diff --check` passed. The project PostgreSQL is listening on 127.0.0.1:55432; no application service was left running.

## 2026-09-30 — Railway new-service setup correction

- The owner connected `NicoleBiii/family-menu` to a Railway app service in the `staging` environment with branch `main`, but the service Settings page showed `Could not load public networking` under Networking and Scale. No successful deploy or domain is verified.
- Railway's 2026 documentation says new services cannot opt into the deprecated Config as Code format. The existing `railway.json` therefore must not be assumed to set the Dockerfile builder, migration or healthcheck on this new service. Railway still auto-detects a root `Dockerfile`; the build log should confirm `Using detected Dockerfile!`.
- A [Railway support case](https://station.railway.com/questions/could-not-load-public-networking-6536cb38) with the same Networking/Scale error attributed it to undeployed staged service changes. Corrected the preview runbook and README to configure migration and readiness in the app service Settings, deploy the staged app/database first, then generate the domain and add auth/AI variables. This is a documented next action, not a verified fix for the owner's Railway account.
- Validation: Prettier check on the five edited Markdown files and `git diff --check` passed. No application code changed; the full local `npm run check` was not rerun for this documentation correction. PR CI remains the required merge gate.

## 2026-10-01 — Staging readiness and owner smoke record

- The owner reported the Railway app service is `Active` and provided `https://family-menu-staging.up.railway.app`. The owner-provided build log shows a Dockerfile build with `npm ci`, `npm run build` and image push. Deployment ID, deployed commit and migration log have not been supplied.
- External `curl` checks on 2026-10-01 returned HTTP 200 and `{"status":"ready"}` from `/api/health/ready` at 17:34 UTC, and HTTP 200 from `/` around 17:35 UTC. These confirm public reachability and database/schema readiness, not sign-in, AI or ordering behavior.
- Created `docs/verification/2026-10-01-infra-001-staging.md` with these checks and pending owner manual smoke rows. INFRA-001 is ready for verification, not Done; UX-001's phone and screen-reader checklist can now use the preview URL.
- Verification for this documentation-only update: Prettier check on edited Markdown and `git diff --check`; no application code changed, so the full local `npm run check` was not repeated. Hosted PR CI remains the merge gate.
