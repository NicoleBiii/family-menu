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

## 2026-10-01 — Owner staging smoke results

- The owner marked all six staging manual-smoke rows Pass in the working tree and confirmed in chat that all tests passed. Preserved those edits. No device/browser, per-step observations, deployed commit, deployment ID or migration log were provided; the record leaves those fields open.
- This is owner-reported functional smoke on the HTTPS preview, including Google sign-in, recipes/photo, one Gemini draft, orders/shopping and a second-member collaboration flow. It does not close UX-001's real-phone, screen-reader or zoom checks.
- The owner has UI feedback to provide. Collect it now and prioritize bounded fixes before release regression. Next release task after UX verification is REL-001 (backups/restore, alert delivery, release identity and spend review).

## 2026-10-01 — Staging device and runtime evidence

- The owner clarified that the six passed smoke steps used desktop Chrome and Chrome on an iPhone 18 Pro Max, and reported no problems at 200% zoom or with a screen reader. The exact device-to-step coverage, screen reader and its workflow were not specified, so UX-001's detailed manual checklist remains open.
- The owner supplied a Railway runtime log showing Nest started successfully and listened on port 8080 at 18:12:44 UTC. The `Stopping Container` line has no accompanying error. This log does not include the pre-deploy migration result, deployed commit or deployment ID.
- The owner proposed nine UI/product changes and requested discussion and approval before major implementation. They confirmed a shared order basket with one final submission, household-shared shopping checks that return to pending when demand increases, and a free photo-library chooser as the preferred first image option. They also selected UI-only English/Chinese translation for the first phase, one primary category per household recipe, and a generic invitation card that does not expose the household name. Detailed semantics and implementation remain to be agreed. No UI or business behavior changes were made in this evidence update.

## 2026-10-01 — UX-002 expansion proposal for owner review

- The owner confirmed that Menu remains the recipe-management area while Meals becomes the categorized browsing and basket entry point. Shopping history should record purchased ingredients, quantities and time, and a later increase should show only the additional amount to buy.
- Wrote `docs/proposals/2026-10-01-ui-expansion.md` as a proposed scope and acceptance design for all nine requested changes. It separates confirmed direction from implementation choices, explains additive category/purchase-data needs, preserves household editing and existing order snapshots, and leaves automatic image generation deferred.
- No feature code, database migration or change to the owner-confirmed MVP specification was made. Await explicit owner approval of the proposed scope/sequence before implementation. Documentation formatting and PR CI are the verification gates for this design task.

## 2026-10-01 — UX-002 approved; first interaction checkpoint

- The owner approved implementation of the UI expansion proposal. PR #16 Quality checks passed and the proposal merged to `main` as `13df79f` before feature work. The approved scope adds bilingual interface, categories, menu-style basket, persistent shopping purchases/history, clearer image upload, sign-out confirmation, browser branding, generic invite preview and a free-library chooser. Automatic generated images remain deferred.
- On `codex/ux-002-phase-1`, implemented sign-out confirmation, desktop photo drag-and-drop with the existing upload path, a prominent phone photo button, SVG favicon and a 180 px Apple touch icon. No data migration or new dependency.
- Node 24.19.0 `npm ci`, web typecheck, production build, focused Playwright (14/14 desktop/mobile cases) and the full `npm run check` (68 integration, 46 browser) passed after rebuilding. An initial sandbox loopback `EPERM` and a stale-asset test run were resolved by permitted loopback access and rebuilding; see `verification/2026-10-01-ux-002-polish.md`.

## 2026-10-02 — Generic invitation preview checkpoint

- PR #17 Quality checks passed and the interaction checkpoint merged to `main` as `dc0c16c`.
- On `codex/ux-002-invite-preview`, added server-rendered Open Graph metadata to `/join` with an absolute card URL from the configured application origin. The card uses the existing pot mark and generic copy; it contains no household name or invitation token. The token remains in the URL fragment and is not sent in HTTP requests for the preview.
- The invitation integration test fetches the public HTML and PNG, confirms the generic metadata and absence of household name/token, and then continues the existing single-use invitation flow. Focused auth tests passed 12/12. Full `npm run check` passed on Node 24.19.0: format, lint, types, builds, 68 integration tests and 46 browser cases. A real iMessage preview remains to be checked after staging deploy; the provider may cache cards.

## 2026-10-02 — UX-002 interface localization checkpoint (Codex → Claude Code)

- PR #18 merged the generic invitation preview to `main` as `a7da89a`. On `codex/ux-002-localization`, Codex committed the bilingual shell, household, join and menu foundation (`1acd032`) and left uncommitted translations for the remaining pages and photo errors. Codex's last file change was at 09:06 local time; the owner asked Claude Code to continue, so Claude Code released Codex's stale claim and claimed UX-002. The uncommitted work was preserved and reviewed rather than rewritten.
- Claude Code added code-aware error translation: known server codes (`nonexistent_time`, AI refusal and AI draft failure codes) map to translated messages; English keeps the server's specific 4xx text. This also corrects English `ai_disabled`/`budget_exhausted` responses, which `readResponse` previously replaced with the generic 5xx text. Added Chinese AI-failure and Chinese invited-member join browser cases.
- Validation: full `npm run check` on Node 24.19.0 passed (68 integration, 56 browser); the later Chinese join case passed in a focused run (8/8). Evidence and remaining gaps: `verification/2026-10-02-ux-002-localization.md`. Next UX-002 phase: household categories with AI suggestions.

## 2026-10-02 — UX-002 recipe categories (Claude Code)

- PR #19 (localization) passed Quality checks and was squash-merged as `6f37a93` at the owner's request. GitHub auto-merge is disabled for this repository, so the merge was manual after CI.
- On `claude/ux-002-categories`, implemented proposal §3 per the new ADR 0007: additive migration 007 (`recipe_categories`, nullable `recipes.category_id` with a composite household foreign key), shared category routes with membership checks, delete-with-destination that bumps moved recipes' revisions, optional `categoryId` on recipe and AI saves (omitted on update keeps the category), preset category keys, AI prompt category context with a bounded `suggestedCategory`, and the Menu/editor UI in both languages.
- Decision: the worst-case AI input estimate rises from 2,500 to 5,000 tokens to cover up to 30 × 40 characters of category names; ADR 0006 marks the old figure superseded. Household, personal and monthly-budget limits are unchanged.
- Validation: full `npm run check` on Node 24.19.0 passed (75 integration, 66 browser). Migration 007 is not yet applied to the development database or staging. Evidence: `verification/2026-10-02-ux-002-categories.md`. Next UX-002 phase: categorized Meals browsing and the single-submit basket.

## 2026-10-02 — UX-002 Meals basket (Claude Code)

- PR #20 (categories) passed Quality checks and was squash-merged as `532292d` at the owner's request.
- On `claude/ux-002-basket`, implemented proposal §2 per the new ADR 0008, web-only: Meals opens on a categorized dish browser with Add / +/− servings and a basket summary. The basket lives in session storage per household with one request id until placed. Review uses the order editor's new basket mode, and one Place order creates one order through the existing API. The Menu dialog's action is now "Add to basket". Sign-out clears stored baskets, and archived dishes leave the basket with a notice. The old single-dish create form is replaced.
- Validation: full `npm run check` on Node 24.19.0 passed (75 integration, 72 browser) after updating `states.spec.ts`, whose mocked orders failure is now reached through Upcoming. Evidence: `verification/2026-10-02-ux-002-basket.md`. Next UX-002 phase: shared shopping checks, reconciliation and purchase history, which first needs a focused data-model decision.

## 2026-10-02 — Shopping purchases design proposed (Claude Code)

- PR #21 (Meals basket) passed Quality checks and was squash-merged as `8264565` at the owner's request.
- Wrote ADR 0009 (proposed, awaiting owner review) for UX-002 phase 4. Each check records a purchase plus exact-rational allocations to the pending order items it covers. Remaining = Σ max(0, required − covered) per (ingredient, form, unit family) line. Check and undo are appended to `audit_events`. A per-line token with a household advisory lock makes stale or concurrent checks fail with 409 instead of double-recording. This satisfies the egg example, closed orders not covering later ones, and unit/form separation without pantry semantics.
- Open owner questions: partial purchase amounts, whether spare amounts after an order shrinks should carry over, and history length. No code or migration has been written for this phase; implementation waits for approval.

## 2026-10-02 — UX-002 shared shopping checks implemented (Claude Code)

- The owner accepted ADR 0009 with the recommended answers: no partial amounts, no carry-over of spare amounts, history limited to the latest 100 purchases. ADR 0005's checkbox deferral is marked superseded.
- Implemented on `claude/ux-002-shopping-design`:
  - additive migration 008 (purchase and allocation tables, an order-item composite key, widened audit checks) and readiness for the new tables;
  - pure exact-rational reconciliation (`buildChecklist`);
  - check, undo and history routes under a household advisory lock, with a per-line token and 409 `shopping_changed`;
  - the shared checklist UI with a History view in both languages.
- Validation: full `npm run check` on Node 24.19.0 passed (83 integration, 76 browser). Migration 008 is not yet on the development database or staging. Evidence: `verification/2026-10-02-ux-002-shopping-checks.md`. Next UX-002 phase: the free photo-library chooser.

## 2026-10-02 — UX-002 photo library and shopping merge (Codex)

- The owner confirmed Claude Code had paused. Codex inspected the clean `claude/ux-002-shopping-design` branch and stale Claude checkout claim, released it and claimed UX-002. PR #22 had a successful Quality checks run on its head `541a6a2`, so it was squash-merged to `main` as `00770f6`.
- On `codex/ux-002-photo-library`, implemented the approved explicit Pexels photo search and choice in the recipe dialog and edit form. `PEXELS_API_KEY` stays server-side; the chosen id is resolved on the server, the image host and response size are restricted, redirects are rejected, and the existing private WebP path stores the photo. Additive migration 009 stores photographer/source credit with the image, clearing it when a manual image replaces the library image. Manual upload remains usable when the provider or key is unavailable. English and Chinese UI labels are included.
- The first full browser run exposed a pre-existing Shopping date-range response race (an older response could overwrite a newer scope). The page now ignores stale results. The focused Shopping browser run passed desktop/mobile (2/2) after the fix.
- Validation on Node 24.19.0: `npm ci --offline`, OpenAPI regeneration and full `npm run check` passed on the final implementation (85 real-database integration, 78 desktop/mobile browser cases). The first full run passed 85 integration but had one browser failure from the race above; it was fixed before the successful second run. The photo provider was stubbed locally; a live key, staging migration result, real-phone review and iMessage preview remain pending. Evidence: `verification/2026-10-02-ux-002-photo-library.md`. Implementation checkpoint: `3d2f5bb`.

## 2026-10-02 — UX-002 photo merge and staging signal (Codex)

- PR #23 Quality checks passed on `d72d569`, then the photo-library branch was squash-merged to `main` as `42a4c04`. This is the current implementation release candidate; no direct push to `main` was made.
- GitHub's deployment API reports staging deployment `6817641570` for shopping merge `00770f6` successful at 20:30:53 UTC and `6818873585` for photo merge `42a4c04` successful at 21:40:27 UTC. The public staging readiness endpoint returned HTTP 200 with `{"status":"ready"}`, and its OpenAPI exposed the two photo-library routes. These GitHub IDs are not Railway deployment IDs. The private Railway project page was inaccessible in this browser session, so pre-deploy migration logs and Railway IDs remain pending. A live Pexels key/import was not checked.
- This documentation checkpoint is on `codex/ux-002-deploy-evidence`. Only Prettier and `git diff --check` are needed for these record changes; PR Quality checks remain the merge gate.
- PR #24 Quality checks passed on `1303544`; the documentation was squash-merged to `main` as `387778a`. The closeout updates the handoff to point at Railway's pre-deploy log instead of the already merged documentation PR.

## 2026-10-02 — UX-003 home, ordering and confirmation pages (Codex, then Claude Code)

- The owner confirmed a revision on 2026-10-02 ([proposal](proposals/2026-10-02-home-ordering.md)): the household menu becomes Home outside the bottom tabs, recipe management moves to `/recipes`, dishes are ordered from Home with a category rail and floating basket, review happens on a separate `/checkout` page, and Orders keeps only Pending and History. This supersedes the UX-002 choice of Menu as a tab and Meals as the dish browser; order and shopping data rules are unchanged.
- Codex claimed UX-003 on `codex/ux-003-home-ordering` and wrote the proposal plus most of the web changes, then stopped at its usage limit with no commit and no test updates. The owner confirmed Codex had stopped; Claude Code released the stale claim and claimed UX-003.
- Claude Code completed the page/ordering part: restored the archived-dish notice with a household-switch guard (shared `keepAvailable` in `basket.ts`), made `/checkout` handle loading sessions and archived dishes before the form fills, kept Empty basket on phones as an icon button, restored the "Added … to the basket" confirmation, made the brand link navigate in-app, and fixed a nested-section ambiguity on `/recipes`. Browser specs were updated for the new routes and labels, with new coverage for the category rail, browser Back/Forward on checkout, Orders views, direct `/checkout` pruning, and Recipes/Checkout document titles.
- Validation on Node 24.19.0: full `npm run check` passed (85 integration, 78 browser). Evidence: `verification/2026-10-02-ux-003-home-ordering.md`. Next: PR and owner phone review for this part, then grouped per-dish shopping checks as a separate PR.

## 2026-10-02 — UX-003 merge, staging review and navigation zoom fix (Claude Code)

- PR #26 Quality checks passed on `b402b2a`; at the owner's request it was squash-merged to `main` as `2cd7328`. GitHub staging deployment `6820203779` reports success, and readiness returned `ready`.
- Owner review on staging: the Chinese labels look good on a phone, and the screen-reader check was reported good. At 200% laptop zoom, Chinese bottom-navigation labels stacked vertically. Cause: the bar's `left: 50%` centring capped its width at half the viewport. Fixed on `claude/ux-003-nav-zoom` with auto-margin centring and no-wrap labels, plus a regression case that fails on the old CSS. Evidence: `verification/2026-10-02-ux-003-home-ordering.md`.
- Owner follow-up on staging: Home must be in the bottom navigation, recipe management needs a way back, and its entry button must be more prominent. Recorded as an amendment to the home-ordering proposal and implemented on the same branch: a Menu (点菜) tab that opens the dishes, a history-aware Back on `/recipes`, and a filled Manage card button, with browser coverage.

## 2026-10-02 — UX-003 follow-up merge and per-dish shopping checks (Claude Code)

- PR #27 (zoom fix, Menu tab, Back, Manage button) passed Quality checks and was squash-merged as `80a9076` at the owner's request. GitHub auto-merge is not allowed for this repository, so the agent waited for the run and merged with `--match-head-commit`. GitHub staging deployment `6820470370` reports success at 23:38:18 UTC. Readiness returned `ready`, and staging served the merged web bundle (`index-CbryO3sJ.js`). The owner reviewed it and reported no problems. They had not yet tried 200% text zoom on the phone; the agent described Chrome's "Zoom Text" setting.
- Implemented proposal criterion 4 on `claude/ux-003-shopping-groups` as an ADR 0009 amendment, without a migration:
  - each by-day dish gets one checkable task per shopping line;
  - `POST …/shopping/purchases` takes an optional `orderItemId`, which allocates only that dish's remaining share under the existing lock and token rules;
  - combined checks are reported as `shared` on every dish they covered, and the UI asks before an undo reopens them together.
- Validation on Node 24.19.0: full `npm run check` passed (88 integration, 82 browser); OpenAPI regenerated. Evidence: `verification/2026-10-02-ux-003-shopping-tasks.md`.

## 2026-10-03 — UX-003 closed after owner review (Claude Code)

- PR #28 (per-dish shopping checks) passed Quality checks and was squash-merged as `4260c1e` at the owner's request. GitHub staging deployment `6820788394` reports success; readiness returned `ready`.
- Owner review on staging:
  - per-dish checks, the combined-list effect and history were fine;
  - phone Chrome at 200% text zoom was fine;
  - a shared-undo retest showed the prompt and reopened both dishes.
- The first attempt reopened one dish without a prompt, which is consistent with a combined check that covered only one dish because the other was already checked. The owner accepted that behaviour.
- UX-003 is Done. Next: reassess the 2026-10-16 release target with the owner, as the home-ordering proposal asks.

## 2026-10-03 — REL-001 production decisions and preparation (Claude Code)

- PR #29 (UX-003 closeout) passed Quality checks and was squash-merged as `08307a2`.
- Decision (owner): there is no reason to wait for 2026-10-16. Release as soon as the release checklist is complete; this supersedes the fixed working date for the family release.
- Decisions (owner, ADR 0010), each the recommended option:
  - production database and sign-in on Supabase Pro in its own organization;
  - UptimeRobot free alerts;
  - a free Railway domain.

  Provider facts checked first: Railway backups need its Pro plan, and Supabase Free projects pause after 7 inactive days.

- Agent design defaults in ADR 0010:
  - production deploys from a `release` branch;
  - Supabase session pooler with `sslmode=verify-full` and a committed public CA file;
  - a restricted runtime login with append-only audit events;
  - residual risk recorded: the migration credential remains visible to the app on Railway.
- Implemented on `claude/rel-001-production`:
  - `scripts/runtime-role.mjs`, with the integration harness, browser server and CI image all running the app as the restricted role;
  - `scripts/restore-check.mjs` and `npm run restore:drill`, rehearsed locally;
  - the production runbook (DEPLOYMENT.md P1–P4) and a budget update.
- Validation: see `verification/2026-10-03-rel-001-preparation.md`; full `npm run check` result recorded there. Next: the owner's Supabase/Railway/UptimeRobot steps.

## 2026-10-03 — UX-004 owner UI polish (Claude Code)

- Before the production setup, the owner asked for four changes:
  - the recipe card's close button should stay visible while scrolling;
  - a floating back-to-top button for long pages;
  - more prominent chosen dishes on Home;
  - a more prominent AI drafting entry, which the owner now prefers to manual entry.
- The owner also plans to keep developing, testing and deploying gradually after release, which matches the ADR 0010 staging-then-`release` path.
- Implemented on `claude/ux-004-polish`, web-only:
  - a sticky dialog header;
  - a global `BackToTop` above the navigation and basket bar;
  - chosen-dish highlight, label and photo badge, plus category-rail basket badges with screen-reader text;
  - a full-width "Draft with AI" card on Recipes, with "Add recipe" as a secondary button.
- Validation: full `npm run check` passed (88 integration, 84 browser). Evidence: `verification/2026-10-03-ux-004-polish.md`. PR #30 (REL-001 preparation) stays open, awaiting the owner's merge decision.
- PR #31 passed Quality checks and was squash-merged as `3b9ac6e` at the owner's request. `main` was then merged into `claude/rel-001-production` (PR #30), with PLAN.md and WORK_LOG.md conflicts resolved by keeping both changes; PR #30 merges next per the owner.
- Owner report: Back from Add recipe or AI drafting went to Home. Fixed on `claude/ux-004-back-navigation`:
  - in-place views (recipe editor, AI drafting, categories, recipe card, order editor) get their own history entries, so Back closes one view at a time;
  - the confirmation page's "Add more dishes" is a real Back;
  - placing an order replaces the confirmation page in history.

  Full `npm run check` passed (90 integration, 90 browser).

## 2026-10-05 — REC-002 bulk recipe import planning (Codex)

- Owner request: continue after Claude paused and plan a text-based bulk recipe entry page with a copyable format/prompt for external AI assistants, request limits and category handling. This authorizes planning; the feature has not been implemented.
- Inspected README, HANDOFF, PLAN, shared handover rules, specification, architecture, budget, recipe/category ADRs and current API validation/transactions. Checkout was clean on `main` at `d7e90a7`. Actual history confirms PR #30 (`6641d02`) and #32 (`d7e90a7`) already merged, superseding stale handoff actions. Released the paused Claude claim and claimed REC-002.
- Added [proposal](proposals/2026-10-05-bulk-recipe-import.md) on `codex/rec-002-bulk-import-plan`: versioned JSON, copyable AI instructions, preview and explicit category mapping/creation, duplicate decisions, 50-recipe/512-KiB provisional limits, atomic writes and durable retry receipts. No internal model call is needed. Existing 500-recipe and 30-category checks are soft; implementation must coordinate every creation path before claiming hard caps.
- The proposal includes observable acceptance criteria, concurrency and household-isolation tests, a controlled additive migration plan and mobile/bilingual coverage. All new thresholds and policies remain proposed rather than owner-confirmed.
- Verification: targeted Prettier passed for all four changed Markdown files; `git diff --check` passed. Full application checks, install, database/browser tests, migration and deployment were not run for this documentation-only change. No runtime dependency or application behavior changed; no service was started/stopped. Existing local service state was not rechecked.
- Next: owner review, then a separately authorized implementation. Save a local documentation checkpoint and release the checkout claim; no remote publication in this session.
