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
