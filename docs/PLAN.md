# Three-Week Plan and Backlog

Version: 0.1. Updated: 2026-10-02.
Current phase: AI-001 done (2026-09-28; Gemini 3.1 Flash-Lite chosen). INFRA-001 staging service is `Active`; the public readiness endpoint returned HTTP 200, and the owner reports all six manual smoke steps passed using desktop Chrome and Chrome on an iPhone 18 Pro Max (docs/verification/2026-10-01-infra-001-staging.md). The owner also reports no problems with 200% zoom or a screen reader; UX-001's detailed manual checklist remains open because the exact coverage was not specified. Deployment identity and pre-deploy migration evidence remain to be recorded. The owner approved the UX-002 expansion proposal on 2026-10-01; the interaction checkpoint (PR #17) and invitation preview (PR #18) merged; localization merged in PR #19 (`6f37a93`); categories merged in PR #20 (`532292d`); the Meals basket merged in PR #21 (`8264565`); shopping checks/history (ADR 0009, accepted) are implemented on `claude/ux-002-shopping-design` awaiting PR CI; the free-library chooser is next. Branch protection is unavailable on the free private plan (PR-plus-CI convention instead). The repository moved to /Users/bibi/Bibi_Dev/family-menu on 2026-09-26.
Working window: 2026-09-25 to 2026-10-16, assuming a start on the document date.

## Planning assumptions

Availability is flexible but unquantified. Treat this as a milestone sequence, not a verified effort estimate or delivery guarantee. It assumes regular focused work, rapid feedback, and the confirmed deferrals. Review actual progress after the first three working days.

Prioritize a complete core workflow early. If behind schedule, reduce seed-library size and visual polish before reducing permission, data-integrity, or release checks. If core correctness is still unresolved, release a smaller private preview or move the date rather than calling it stable. Any removal of a confirmed feature requires an explicit scope update.

## Milestones and checkpoints

| Window                    | Deliverable                                                                     | Exit evidence                                                                              |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Days 1–2: Sep 25–26       | Project baseline, local repository, schema/API outline, initial deployment path | A minimal app starts reproducibly; first checks run; isolated preview can be reached       |
| Days 3–5: Sep 27–29       | Google sign-in, household creation/invites, manual/preset menu                  | Two test households cannot access each other's data; a member joins and creates a recipe   |
| Days 6–7: Sep 30–Oct 1    | Basic order, scheduling, completion                                             | One real end-to-end household workflow works with saved data                               |
| Days 8–10: Oct 2–4        | Collaborative order edits, snapshots, shopping aggregation/views                | Stale updates fail safely; both shopping views pass quantity fixtures                      |
| Days 11–14: Oct 5–8       | AI draft/confirm workflow, quotas, mobile integration                           | Limited generation works; failures do not block manual use; core scope is feature-complete |
| Days 15–18: Oct 9–12      | Regression, access checks, timezone/mobile testing, cost measurement            | Relevant AC checks pass; no critical permission/data-loss defect; cost forecast recorded   |
| Days 19–21: Oct 13–15     | Restore drill, release smoke tests, small-household feedback, English demo      | Recovery/alert evidence, documented limitations, release candidate and portfolio materials |
| Target checkpoint: Oct 16 | Invite-only first release                                                       | Readiness checklist passed or remaining gaps explicitly reported                           |

Days are calendar sequencing slots, not a requirement to work without breaks.

## Active and near-term backlog

| ID        | Task                                                                | State                  | Completion condition                                                                                                                                                         |
| --------- | ------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DISC-001  | Establish local planning starter                                    | Done                   | Initial seven-document starter and dated archive exist                                                                                                                       |
| DISC-002  | Record role, skills, availability, deadline, budget                 | Done                   | PROJECT_BRIEF.md captures owner input; flexible hours are not fabricated                                                                                                     |
| DISC-003  | Define product and primary problem                                  | Done                   | Household-menu concept and owner's observations recorded                                                                                                                     |
| DISC-004  | Confirm release priorities and collaboration rules                  | Done                   | Owner selected all-member order editing and accepted explicit v1 deferrals                                                                                                   |
| DOC-001   | Write product-specific specification, plan, architecture and budget | Done                   | v0.1 documents exist; assumptions and sources are marked                                                                                                                     |
| ENG-001   | Establish dedicated development repository and local foundation     | Local complete         | Reproducible setup, migrations, health/OpenAPI, mobile shell, local checks and prepared CI; see verification record                                                          |
| INFRA-001 | Connect remote repository and isolated cloud preview                | Ready for verification | Done: private repo, CI image check, Dockerfile, `Active` Railway service, public readiness 200 and owner-reported six-step smoke. Open: release identity and migration log   |
| AUTH-001  | Google authentication and household isolation                       | Done                   | Local tests (verification/2026-09-26-auth-001.md) and real-provider smoke (verification/2026-09-26-auth-001-provider-smoke.md); denial path stub-only                        |
| REC-001   | Manual/preset recipes and private images                            | Done                   | AC-05 and AC-12 (verification/2026-09-26-rec-001.md, ADR 0003); photos in PostgreSQL; presets accepted by the owner                                                          |
| ORD-001   | Orders, scheduling, snapshots and shared editing                    | Done                   | AC-03–04, AC-07–08, AC-11 (verification/2026-09-26-ord-001.md, ADR 0004)                                                                                                     |
| SHOP-001  | Ingredient calculation and two shopping views                       | Done                   | AC-09–10 (verification/2026-09-26-shop-001.md, ADR 0005)                                                                                                                     |
| AI-001    | Provider evaluation and bounded draft generation                    | Done                   | AC-06, AC-13 (verification/2026-09-27-ai-001.md, ADR 0006); Gemini 3.1 Flash-Lite chosen after a measured three-provider evaluation; staging smoke with INFRA-001            |
| UX-001    | Mobile flow, accessibility and error states                         | Ready for verification | AC-14 automated; owner reports iPhone Chrome, 200% zoom and screen reader checks had no problems. Detailed manual checklist remains open (verification/2026-09-27-ux-001.md) |
| UX-002    | Bilingual UI and ordering/shopping expansion                        | In progress            | Owner approved proposals/2026-10-01-ui-expansion.md; all nine areas meet its acceptance criteria and pass staged verification                                                |
| REL-001   | Release, alerting, recovery and budget checks                       | Not started            | AC-15 and release checklist below                                                                                                                                            |
| PORT-001  | English project story and demo                                      | Not started            | Reproducible README, short demo, architecture explanation and honest evidence links                                                                                          |

## ENG-001 first-task outline

- Select a dedicated local development directory and transfer these documents as the authoritative set; retain dated archives as snapshots rather than editing two active copies.
- Use one repository; verify the recommended React/Vite + NestJS + PostgreSQL setup against the owner's environment and current supported versions.
- Record a short decision for ORM/migrations and authentication/session implementation.
- Add local setup, environment-variable examples without secrets, locked dependencies, health route, and a simple mobile shell.
- Establish schema migrations and OpenAPI generation.
- Add CI for install, checks, build, and a first real-database integration test.
- Verify an isolated preview deployment when the required service accounts/credentials are available. Do not claim provider integration works before that check.
- End with exact local/CI results, a coherent Git checkpoint, and an updated handoff. GitHub publication and service purchases are not implied by a backlog item.

## Later backlog

| ID        | Capability                | Additional design required                                                            |
| --------- | ------------------------- | ------------------------------------------------------------------------------------- |
| LATER-001 | Household virtual wallet  | Ledger, allocation authority, edit/refund semantics, atomic balance checks            |
| LATER-002 | Paid AI membership        | Separate real-money billing, entitlements, webhook idempotency, cancellation rules    |
| LATER-003 | Social-link recipe import | Supported sources and permissions, fetching limits, SSRF defenses, preview/provenance |
| LATER-004 | Grocery checkout          | Vendor integration, item mapping, explicit purchase confirmation                      |
| LATER-005 | Meal photos               | Storage/retention, history attachments, privacy                                       |
| LATER-006 | Granular permissions      | Explicit roles and migration from shared editing                                      |
| LATER-007 | Pantry inventory          | Pantry quantities and reconciliation beyond the approved shopping purchase history    |

## Release checklist

- [ ] Applicable AC-01–AC-15 checks have evidence, including negative cases.
- [ ] Required CI checks protect the selected release commit.
- [ ] Google auth and model provider have real staging smoke-test evidence.
- [ ] Household-isolation and concurrent-edit tests pass.
- [ ] Shopping totals, date grouping, snapshots, and cancellation/completion behavior pass.
- [ ] AI limits are enforced under concurrency; manual fallback remains usable.
- [ ] Image access/validation and seed asset rights/provenance are checked.
- [ ] Production and test data/credentials are isolated.
- [ ] A database-and-image restoration into a clean environment is recorded.
- [ ] Alert delivery and production rollback/forward-fix instructions are checked.
- [ ] Projected spend, including staging and contingency, is within the selected budget.
- [ ] Real-device usability, known limitations and beta support expectations are recorded.
- [ ] English README, demo and release notes reflect actual implemented behavior.

## Work-session routine

Select one task → define observable completion → implement → verify → update status/log/handoff → save a coherent Git checkpoint once a repository exists.

Use Ready, In progress, Ready for verification, Done, Awaiting input, or Blocked. Done requires evidence. Preserve failures and unfinished checks rather than rewriting the record to appear complete.
