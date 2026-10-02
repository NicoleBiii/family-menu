# UX-002 Invitation Preview — 2026-10-02

Scope: a generic branded preview for invitation links. No household name, token or member information is embedded in preview metadata or its graphical card.

## Acceptance evidence

- `GET /join` returns Open Graph title, description, image and dimensions in the initial HTML response. The image URL uses the configured application origin; JavaScript and authentication are not needed to read the metadata.
- The 1200 × 630 PNG card is publicly reachable and uses a vector source derived from the existing pot mark. The invitation token remains after `#` in the share URL, outside the HTTP request.
- The real-database invitation integration test confirms the page does not contain the household name or token, fetches the PNG, then verifies the usual preview and single-use acceptance behavior.
- Focused auth suite: 12/12 passed. Full Node 24.19.0 `npm run check`: format, lint, typechecks, builds, 68 integration tests and 46 desktop/mobile browser cases passed. No new package or database migration.

## Remaining verification

- Check a newly created invitation in iMessage on a physical iPhone after this commit reaches staging. External preview providers can cache older metadata, so test with a fresh link and record the observed card and deployment identity.
