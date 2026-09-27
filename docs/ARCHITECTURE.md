# Architecture Proposal

Date: 2026-09-25. Status: foundation partially implemented locally on 2026-09-26; provider integration and domain features remain planned. See decisions/0001-foundation.md and the verification record for the implemented subset.

## Selection rationale

Use the owner's professional NestJS experience for a modular monolith. Build a responsive React + TypeScript frontend with Vite and one existing component system. A small client-rendered application is sufficient for the authenticated household workflow; revisit server rendering if public recipe discovery becomes a product requirement.

Use PostgreSQL for membership, recipes, orders, revision checks, and quota reservations. The foundation selected Kysely with pg for typed queries and recorded migrations. Exact verified versions live in package manifests and the lockfile; see ADR 0001.

Recommended hosting candidate: Supabase for hosted PostgreSQL, Google authentication, and private object storage; Railway for the NestJS application. NestJS can serve the built frontend and /api under one origin to simplify the first deployment. This is one application deployment, not a requirement for microservices or Kubernetes.

## Proposed source layout

```text
apps/
  api/src/modules/
    identity/
    households/
    recipes/
    orders/
    shopping/
    ai-drafts/
    media/
  web/src/features/
    household/
    menu/
    orders/
    shopping/
packages/
  api-client/        # generated from the API contract where useful
db/migrations/
tests/integration/
tests/e2e/
docs/
.github/workflows/
```

Expose an OpenAPI contract from NestJS. Keep DTO validation at the API boundary, business rules inside services, and database constraints in migrations. Frontend types do not replace server-side validation.

## Trust boundaries

- Supabase Auth establishes identity; NestJS authorizes every household operation against current database membership. A valid identity token does not itself grant household access.
- Validate issuer, audience, signature, and expiry with the provider's supported verification mechanism. Choose and document browser session storage, refresh, CSRF, and logout behavior during foundation; prefer a reviewed same-origin secure-cookie/BFF session pattern and never expose service credentials.
- All business reads and writes go through NestJS. Keep business tables in a non-exposed schema and restrict grants. Disable the Data API if unused; do not accidentally allow browser access to bypass NestJS authorization.
- Use a restricted application database role, separately from the migration owner. Supabase ownership/service credentials must not become browser credentials.
- Scope database queries by household and object identity. Enforce cross-record household consistency through composite keys/constraints where practical.
- Private recipe images are delivered through short-lived authorized URLs. Restrict uploads, validate actual file content and dimensions, remove metadata where appropriate, and limit size. Preset assets with suitable rights can be public. _Superseded 2026-09-26 by [ADR 0003](decisions/0003-recipes.md): photos are re-encoded small WebP files stored in PostgreSQL and served only through the session-authorized API; no object storage bucket is used._
- Membership removal, mutation authorization, and data writes must have a defined transaction/locking strategy so a removal race cannot allow later unauthorized mutations.

## Conceptual records

| Record             | Purpose / important invariant                                    |
| ------------------ | ---------------------------------------------------------------- |
| UserProfile        | Maps provider identity to an application user                    |
| Household          | Name and IANA timezone                                           |
| HouseholdMember    | Unique household/user pair, role, active status                  |
| HouseholdInvite    | Hashed random token, expiry, revocation, bounded usage           |
| RecipeTemplate     | Curated global source, provenance, yield and ingredients         |
| HouseholdRecipe    | Household-owned mutable copy, revision, archival state           |
| RecipeIngredient   | Structured quantity, unit, identity/form, notes                  |
| MediaAsset         | Household ownership or explicitly public preset provenance       |
| MealOrder          | Household, scheduled time, status, notes, revision, actor fields |
| OrderItem          | Requested servings and immutable selected-recipe snapshot        |
| AiDraftRequest     | Idempotency identity, state, provider metadata, draft result     |
| AiUsageReservation | Atomic quota/cost reservation and reconciliation                 |
| AuditEvent         | Who changed a business object, when, and mutation type           |

The shopping list is derived from pending order snapshots, not a second independent source of ingredient truth. No wallet, payment, subscription, or grocery-integration tables are required for v1.

## Async work without premature infrastructure

Persist AI request states and reservations in PostgreSQL. A bounded in-process worker can claim jobs through database locking and a lease; the client polls job status. Recover stale leases on restart, and treat provider-timeout outcomes conservatively. Do not promise exactly-once execution of an external model call without provider support. A separate worker process/Redis queue is a later scaling option, not a first-release prerequisite.

Bound image processing and job concurrency. Model inference runs at the external provider: an application GPU is unnecessary for this proposal.

## CI/CD baseline

For each PR: locked dependency install, lint/typecheck, build, relevant unit tests, PostgreSQL integration tests, critical browser tests, and dependency/secret checks. Use deterministic provider substitutes in normal CI; real Google/AI integrations receive controlled staging checks. No production credentials in untrusted PR jobs.

Build a versioned deployment artifact. Test that artifact against isolated staging data before promoting the same release to production where the platform allows it. Public frontend configuration must remain compatible with artifact promotion, e.g. runtime configuration; never insert secrets into browser assets.

Use short-lived staging resources and synthetic data to stay within budget. Provider-backed auth and storage still need staging coverage; a local database alone is not equivalent to end-to-end cloud testing. Separate callback URLs, credentials, database, and bucket from production. Cost additional project/compute time explicitly.

Run migrations as one controlled release step, not concurrently from each application instance. Favor additive compatible migrations. Reverting an application is safe only while the database remains compatible. Record the release identifier, migration version, smoke test, and recovery instructions.

## Operations for the initial beta

- Observe sign-in, order mutation errors, shopping calculation failures, AI failures/latency, quota consumption, and estimated monthly spend.
- Log request IDs, release IDs, and useful error context; exclude tokens, raw private prompts, full order notes, and unnecessary personal data.
- Exercise an external availability alert and an application error alert before launch.
- Initial recovery planning target: no more than 24 hours of recoverable database/file loss with daily backups and restoration within four staffed hours. These are unverified design targets, not an SLA. A smaller data-loss window requires a different backup strategy and budget.
- Keep database backups and object-file backups separately; store an independent recoverable copy and test their consistency in a clean environment.
- Disable optional AI generation on cost/provider incidents while preserving manual recipes and order operations. An infrastructure spending hard stop can shut the entire application down, so it is a last-resort budget control with an explicit availability tradeoff.
- Test a representative small dataset and a modest initial load (proposed: 10 concurrent active users); record observed latency instead of claiming an unmeasured capacity.

## References checked on 2026-09-25

- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [Supabase Google authentication](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase database backups, including storage exclusions](https://supabase.com/docs/guides/platform/backups)
- [Railway cost controls](https://docs.railway.com/pricing/cost-control)
