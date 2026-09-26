# Foundation Verification — 2026-09-26

Scope: ENG-001 local foundation. These results do not certify the unimplemented household product.

## Environment

- macOS, ARM64.
- Node 24.19.0, npm 10.9.2.
- Local isolated PostgreSQL 14.18, loopback port 55432.
- Dependency versions are pinned in manifests and package-lock.json.
- Test data uses dedicated local databases and synthetic identifiers.

## Completed checks

| Check                                            | Result                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Formatting, ESLint, strict TypeScript checks     | Passed                                                     |
| NestJS and Vite production builds                | Passed                                                     |
| Initial PostgreSQL migration                     | Applied successfully                                       |
| Migration rerun                                  | No migrations reapplied                                    |
| Real PostgreSQL/API integration tests            | 5 passed, 0 skipped                                        |
| Desktop/mobile browser tests                     | 6 passed                                                   |
| OpenAPI generation                               | Completed                                                  |
| Runtime dependency audit                         | 0 known vulnerabilities reported at the time of the query  |
| Clean lockfile installation (`npm ci --offline`) | Passed                                                     |
| Agent handover guard                             | Concurrent claim and wrong-agent release correctly refused |
| In-app browser inspection at 360 × 780           | Sample UI reviewed, no horizontal overflow observed        |
| Browser console during inspection                | No warnings/errors returned                                |

Integration tests cover duplicate membership, invalid roles, missing parent constraints, liveness/readiness and OpenAPI HTTP responses, database-failure redaction, and invalid configuration. Browser tests cover filtering/no results, dialog dismissal/focus restoration, honest sample navigation, viewport width, and JSON API 404s.

The initial sandbox blocked PostgreSQL shared memory. The isolated local cluster and its tests were then run with the necessary execution permission. No system PostgreSQL service was modified. An initial TypeScript 7 peer-range mismatch was resolved by pinning TypeScript 6.0.3; checks passed on the compatible version.

## Not verified / not implemented

- GitHub-hosted CI, protected branch settings, hosted preview, or production deployment.
- Docker build and Compose startup (Docker is unavailable on the host).
- PostgreSQL 17 runtime compatibility beyond the prepared configuration; local tests used 14.18.
- Google/Supabase identity flows, sessions, or household authorization.
- Saved recipes, orders, concurrency control, shopping calculations, AI requests/quotas, media upload, or backup restoration.
- Physical-phone testing, high-load performance, penetration testing, comprehensive secret scanning, or external-user feedback.

The sample cards are frontend fixtures, not a persisted seed library. Estimates in the budget are not measured cloud bills.
