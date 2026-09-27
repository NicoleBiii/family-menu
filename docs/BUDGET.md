# Operating Budget Proposal

Checked: 2026-09-25. Currency of the owner's budget: CAD. Preferred ceiling: CAD 100/month. No services have been purchased.

## Planning assumptions

- Invite-only beta of approximately 5–10 households; no measured traffic yet.
- Text AI generation only; no video extraction, model training, self-hosted inference, or generated images.
- Modest image uploads, compressed derivatives, and enforced quotas.
- One production stack, local/CI test environments, and short-lived isolated cloud staging rather than a second full-time paid stack.
- For conservative arithmetic use USD 1 = CAD 1.40 as a planning assumption, not a live exchange-rate quote. Actual provider charges, applicable tax, card conversion, and renewals must be checked before purchase.
- Development assistant subscriptions and the owner's labour are excluded from the website operating budget. Domain payment may be annual even though the estimate is amortized monthly.

## Monthly allocation

| Item                                            | CAD planning allocation | Basis                                                                                             |
| ----------------------------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------- |
| Supabase production database, auth, and storage |                      35 | USD 25 base Pro tier at assumed exchange rate; first Micro project within included compute credit |
| Railway NestJS application serving frontend     |                      12 | Target usage allocation, not a fixed provider quote; must measure RAM/CPU/egress                  |
| Temporary isolated staging                      |                       5 | Limited active time; a full-time additional paid database would cost more                         |
| Text AI API                                     |                      12 | Application-controlled spend allocation; model and price per draft not yet chosen                 |
| Domain, monthly equivalent                      |                       3 | Allowance pending domain selection and renewal quote                                              |
| Independent backup and monitoring allowance     |                       3 | Small-usage allowance; validate actual service costs                                              |
| Tax, exchange-rate, and usage contingency       |                      15 | Planning reserve, not a tax calculation                                                           |
| **Planned total**                               |                  **85** | **Leaves CAD 15 headroom within the preferred ceiling**                                           |

This is a proposed allocation, not a guaranteed bill. At the same exchange assumption, a full-month second Supabase Micro project adds approximately CAD 14 before tax, instead of the CAD 5 temporary-staging allowance. Preview resources left running, larger compute, image transformation add-ons, or public AI access can exceed the budget.

## Verified provider facts

- Supabase Pro starts at USD 25/month, with the first project included under its base compute allowance. Additional projects start at USD 10/month. Its base tier includes auth/storage allowances and seven days of daily database backups. Source: [Supabase pricing](https://supabase.com/pricing).
- Supabase Free is useful for development, but has inactivity pausing and does not include automatic database backups. Do not assume it meets the intended ongoing-operation standard. Source: [Supabase pricing](https://supabase.com/pricing).
- Database backups do not back up the actual Storage API objects. Images require a separate backup process. Source: [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups). Update 2026-09-26: recipe photos are stored in PostgreSQL instead (ADR 0003), so database backups include them. Each photo is at most 1024 px and typically tens of KB (hard limit 1 MB); even 10 households × 200 photos × 100 KB is about 200 MB of database storage.
- Railway Hobby has a USD 5 minimum with USD 5 usage included; it is not an unlimited USD 5 server. Its resource charges depend on actual consumption. Source: [Railway plans](https://docs.railway.com/pricing/plans).
- Railway's resource hard limit can take workloads offline. Use earlier application-level AI limits and alerts so ordinary use is not the first thing stopped. Source: [Railway cost controls](https://docs.railway.com/pricing/cost-control).

Optional later storage alternative: Cloudflare R2 Standard includes a small free allowance and has separate storage/operation pricing. It may suit independent file backups or later image delivery; do not add another service until needed. Source: [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## AI cost controls before paid membership

Start with configurable per-user and per-household request quotas, plus a global provider-cost reservation limit. A provisional beta quota could be five successful drafts per household per day, but it must be calibrated against the chosen model and global budget; it is not a promised allowance.

Evaluate a small representative set of recipe requests before selecting a model. Record input/output token usage, usable-draft rate, latency, and retries. Compute expected cost from current provider prices:

`cost per call = input tokens / 1,000,000 × input rate + output tokens / 1,000,000 × output rate + applicable extra charges`

Cap input, output, and retry counts. Reserve worst-case allowed cost before concurrent requests are dispatched, reconcile known actual usage, and retain conservative reservations for ambiguous outcomes. Failed/discarded output can still be billable. Rate-limit abuse and repeated calls even when no successful draft is saved.

Use a global monthly AI allocation equivalent to CAD 12, with warning thresholds before exhaustion and a provider-independent feature switch. Implemented in AI-001 as `AI_MONTHLY_BUDGET_USD=8.50` per UTC month (≈ CAD 12 at 1.39 CAD/USD), a warning log above 80%, and `AI_PROVIDER=off` (ADR 0006). Provider dashboard alerts are supplemental; they are not assumed to enforce an exact immediate cap. At exhaustion, users can still use presets and manual recipes.

Paid membership later should grant additional entitlements; it must not be required to make the first beta affordable. Keep entitlement checks behind a small interface, without building subscription billing now.

## Budget acceptance before public rollout

- Measure representative application consumption for several days and project the monthly bill.
- Validate included quotas, selected regions, and any paid add-ons in the actual checkout configuration.
- Include staging, backup, CI usage, domain renewal, currency conversion, and tax in the forecast.
- Demonstrate concurrent AI quota enforcement and the AI-off fallback.
- Establish spend alerts and a documented response at 70%, 85%, and 95% of the CAD 100 budget forecast.
- If the projected recurring total exceeds CAD 100, present the measured driver and a concrete smaller-scope or higher-budget option before increasing recurring spend.
