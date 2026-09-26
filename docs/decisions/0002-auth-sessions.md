# ADR 0002 — Sessions, household authorization and invitations

Date: 2026-09-26. Status: implemented and locally verified (AUTH-001). Real-provider smoke test pending. Refines the AUTH-001 direction in [ADR 0001](0001-foundation.md).

## Decisions

- **Identity only from the provider.** Supabase Auth runs Google OAuth with PKCE. NestJS starts the flow (`/api/auth/login`), receives the code at `/api/auth/callback` and exchanges it server-to-server with the publishable key. The Supabase user id becomes `app.user_profiles.id`. Provider access/refresh tokens are discarded after the exchange; the app does not call Supabase on the user's behalf, so it stores no provider credentials. This supersedes ADR 0001's allowance for storing a refresh credential.
- **Login state.** A random state is set in an HttpOnly `SameSite=Lax` cookie and stored hashed with the PKCE verifier and return path (10 minutes, single use: consumed on every callback attempt). The state is not placed in `redirect_to`, so the Supabase allow list can match the callback URL exactly. A code issued for a different browser's challenge fails the exchange. Post-login destinations are same-site paths only.
- **App sessions.** 256-bit random token in an HttpOnly, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` when `APP_ORIGIN` is https). Only its SHA-256 hash is stored. 30-day absolute and 14-day idle expiry, logout revocation, and rotation (old cookie revoked) on each sign-in.
- **CSRF.** Every state-changing request requires the per-session `X-CSRF-Token` returned by `GET /api/auth/session`; a present `Origin` header must equal `APP_ORIGIN`. SameSite=Lax is defense in depth, not the only control.
- **Authorization in the API.** Every household-scoped route checks membership for the session user. Non-members, unknown ids and malformed ids all return 404 so other households' identifiers are not confirmed. Owner-only: invitations and removing others. Members may leave; the single owner cannot leave in v1 (ownership transfer deferred). Removal deletes the membership row, so access ends on the next request.
- **Invitations.** Owner-created, single-use, 7-day links with at most 20 active per household. Only the token hash is stored; the token is shown once and carried in the URL fragment (`/join#token`), which is not sent to servers or in Referer headers. The browser keeps it in sessionStorage across the sign-in redirect and deletes it after use. Acceptance claims the invitation with a conditional update inside a transaction (plus a row lock), so a link admits exactly one person; a used link never re-admits anyone, including a removed member. Accepting again as the same current member is idempotent.
- **No bypass.** Without `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` the auth routes answer 503; there is no development login. Tests replace the provider's HTTP endpoints with a local stub process, leaving the application code path unchanged.

## Consequences and limits

- AC-01 (except the real-provider smoke), AC-02 for the entities that exist (households, members, invitations) and the access part of AC-03 are covered by integration tests. AC-02 must be re-asserted as recipes, orders, drafts and images are added.
- Not implemented: rate limiting on login/invitation endpoints, ownership transfer, household rename/delete, session listing per device, and account deletion. Expired OAuth states are pruned on the next login; expired sessions/invitations remain as rows until a cleanup job exists.
- The concurrency test for invitation acceptance passes, but it could not be made to fail by removing the row lock alone; correctness rests on the conditional update's PostgreSQL semantics rather than on that test proving the race.
