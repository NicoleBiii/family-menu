# Project Brief — Family Menu

Version: 0.1. Updated: 2026-09-25 (America/Toronto).
Status: core product and first-release feature scope confirmed by the owner.
“Family Menu” is a descriptive working title; branding is undecided.

## Confirmed objective and owner context

Build a mobile-first household menu and recipe website with collaborative meal ordering and ingredient shopping views. Maintain English-first project artifacts and demonstrate backend/full-stack engineering through a product the owner understands and can operate.

The owner is targeting backend and full-stack roles in Toronto. Their strongest professional framework is NestJS; they have broader but shallower experience with multiple languages and frameworks through small projects and simple REST APIs. Target seniority remains unspecified and is not required to start the project.

Availability is flexible; a specific weekly-hour commitment has not been supplied. The desired first release is within three weeks. If work starts on 2026-09-25, use 2026-10-16 as the working release target. Preferred operating cost is below CAD 100/month; a higher cost requires a concrete rationale rather than an automatic increase.

## Primary user and problem

For members of a small household who coordinate what to cook, this service provides a shared editable menu, meal requests for now or later, and a shopping list derived from those requests.

The main onboarding problem is the effort required to build a useful menu and enter recipes manually. The owner reports that existing household-menu products can restrict order editing or make recipe entry cumbersome, while standalone recipe managers may lack household ordering.

Evidence status: these are the owner's observations. No named competitor audit, user interview study, demand measurement, or willingness-to-pay study has been performed.

## Product proposition

Build a household menu quickly from starter recipes, manual entries, and editable AI drafts; collaboratively order meals and turn the plan into a clear ingredient list.

The intended differentiators are reduced recipe-entry effort and editable household meal coordination. AI serves the onboarding workflow and is not required for normal order or shopping operations.

## Confirmed v1 workflow

1. Sign in and create or join a household.
2. Add a dish manually, copy a preset, or generate a limited text AI draft.
3. Review and edit the recipe, then explicitly save it or discard the draft.
4. Select dishes and quantities/servings, choose a meal time, add notes, and submit an order.
5. Any household member can edit any other member's pending order.
6. View ingredients combined across pending orders or grouped by day and dish.
7. Manually complete an order and view its historical record.

## Confirmed dish information

- Dish name.
- Virtual price for future household role-play.
- Dish image.
- Cooking method.
- Required ingredients.

Design additions needed for correct calculation: recipe yield, structured quantities/units, and requested servings. These are explained in [MVP Specification](MVP_SPEC.md).

Virtual prices have no cash value and do not involve real payment. The owner has explicitly deferred virtual balances/allocations for the first release.

## Confirmed first-release scope

- Basic login and household management; Google is the proposed initial identity provider.
- Shared menu editing by all household members.
- Manual recipes, a curated starter collection, and quota-limited text AI recipe drafts.
- User review/edit/save/discard for suggested recipe content.
- Immediate and scheduled orders with notes and post-submission editing.
- Shared order editing by all household members.
- Combined and day/dish-grouped shopping views.
- Manual completion and order history.

## Confirmed later scope

- Household point balances, allocations, and balance-based ordering.
- Real paid membership with larger AI allowances.
- Recipe import from Instagram, YouTube, and other links.
- Grocery-app ordering.
- Photos attached to completed meals.

Keep these ideas in the roadmap without implementing their billing, integration, or wallet infrastructure in v1.

## Proposed technical and delivery approach

Use NestJS for the backend, a mobile-first React/TypeScript frontend, and PostgreSQL in one source repository. Prefer managed identity/database/storage and external text-model inference. See [Architecture](ARCHITECTURE.md) and [Budget](BUDGET.md); provider and stack details are proposals, not purchased services.

Aim for an invite-only first release, not a promise of large-scale availability or a security certification. English is the default UI/documentation language; accept Chinese and other Unicode recipe content.

## Acceptance, evidence, and remaining choices

Observable requirements and failure cases are recorded as AC-01–AC-15 in [MVP Specification](MVP_SPEC.md). Critical evidence includes household isolation, safe collaborative editing, deterministic ingredient aggregation, recipe snapshots, AI draft confirmation and quotas, deployment checks, and tested restoration.

Not yet selected: final product name/domain, remote repository destination/visibility, model/provider, and actual production services. A dedicated local family-menu repository and pinned runtime/library versions now exist; see README.md and ADR 0001. These do not invalidate the confirmed product scope; resolve them at the relevant foundation or integration task.

Update 2026-09-26: ENG-001 now has a local implementation and verification record. NestJS/React/PostgreSQL foundation, a sample UI, migrations and local tests exist. Cloud provisioning, billing, hosted CI and production verification remain pending. Next: AUTH-001 and the external setup gate INFRA-001 in [Plan](PLAN.md).
