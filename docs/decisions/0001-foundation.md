# ADR 0001 — Reproducible local foundation and shared agent context

Date: 2026-09-26. Status: implemented locally. External deployment remains pending.

## Context

The owner authorized the engineering foundation and plans to alternate Codex and Claude Opus. The product targets household collaboration within a three-week first-release window. The owner has professional NestJS experience.

## Decisions

- Use one Git repository with npm workspaces for the API and web client. Avoid an extra monorepo task framework at this size.
- Pin Node 24.19.0, the available LTS runtime, and exact direct dependency versions plus a lockfile. The host's default Node 23 is not the project runtime. TypeScript 7 was rejected during installation because the selected Nest OpenAPI package supports TypeScript 5/6; use 6.0.3.
- Use NestJS 12 and ESM/NodeNext compilation. Compile with TypeScript rather than a transpiler that omits the decorator metadata required by dependency injection.
- Use React/Vite for a client-rendered mobile shell. No component framework is added for the limited foundation controls; native controls and a native dialog provide the current behavior. Reevaluate a component library when richer forms are implemented.
- Use Kysely and the PostgreSQL driver for typed queries, explicit SQL constraints, and versioned migrations. Kysely's migration runner supplies database locking and recorded migration state; do not invent a parallel migration ledger.
- Keep domain tables in the `app` schema with PUBLIC schema privileges revoked. This is not a substitute for household authorization or a restricted production application role, both still needed before business endpoints go live.
- Ship only foundation profile/household/membership tables now. Add recipes/orders/AI tables with their actual feature migrations rather than speculative billing or wallet tables.
- Serve the compiled frontend and API from NestJS in a production build; Vite proxies API requests during development. Unknown `/api` routes remain JSON 404 responses rather than being swallowed by the frontend fallback.
- Keep one `AGENTS.md`; `CLAUDE.md` imports it. Store task state and validation in documents and Git. Add an exclusive advisory local checkout claim, with explicit interrupted-session recovery.

## Authentication/session boundary for AUTH-001

Use Supabase Auth's Google OAuth flow to establish identity, while NestJS owns household authorization. The intended session pattern is a same-origin backend-for-frontend with HttpOnly, Secure-in-production cookies, validated OAuth state/PKCE and allowed callbacks, explicit CSRF protection for state-changing requests, and logout/revocation handling. Store any provider refresh credential server-side with an appropriate protected session store rather than exposing service-role keys or trusting client-supplied user IDs.

Update 2026-09-26: implemented and refined in [ADR 0002](0002-auth-sessions.md), which supersedes the refresh-credential storage allowance below. Original text follows.

This is a recorded design direction, not implemented authentication. AUTH-001 must validate current provider SDK behavior and test expired sessions, CSRF, callback failures, removed membership, and cross-household requests. Do not add a fake login or insecure development identity shortcut to production routes.

## Consequences

The current shell has explicit sample content and no data-writing business endpoint. It is safe to inspect without a provider account but does not demonstrate the completed household product. Local PostgreSQL 14.18 tests passed; PostgreSQL 17 is configured for CI/Compose but has not run on this host. A cloud staging check is still required for actual provider behavior.

CI is prepared with full commit SHA pins, read-only repository permissions, a test database, builds, browser checks, contract drift detection, runtime dependency audit, and a container build. Enforcement and the first hosted run require a remote repository; secret scanning and protected branch rules are not magically enabled by these files.

## Sources checked during implementation

- [Nest runtime and compilation requirements](https://docs.nestjs.com/migration-guide)
- [Node release policy](https://nodejs.org/en/about/previous-releases)
- [Kysely migration semantics](https://kysely.dev/docs/migrations)
- [Claude shared instructions](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)
