import { sql } from 'kysely';

// UX-002 phase 4 (ADR 0009): shared shopping checks. A purchase records one checked shopping
// line (ingredient, form, unit family); its allocations record the exact amount it covered for
// each pending order item. Quantities are exact rationals in the family's base unit, because
// scaled servings can be non-terminating (1/3 g). Unquantified ("to taste") lines have none.
export async function up(db) {
  await sql`
    create table app.shopping_purchases (
      id uuid primary key default gen_random_uuid(),
      household_id uuid not null references app.households(id) on delete cascade,
      ingredient_key text not null check (length(ingredient_key) between 1 and 100),
      form_key text not null default '' check (length(form_key) <= 60),
      family text not null check (length(family) between 1 and 40),
      name text not null check (length(name) between 1 and 100),
      form text check (length(form) between 1 and 60),
      quantity_num bigint check (quantity_num > 0),
      quantity_den bigint check (quantity_den > 0),
      request_id uuid not null,
      created_by uuid not null references app.user_profiles(id) on delete restrict,
      created_at timestamptz not null default now(),
      undone_by uuid references app.user_profiles(id) on delete restrict,
      undone_at timestamptz,
      check ((quantity_num is null) = (quantity_den is null)),
      check ((family = 'unquantified') = (quantity_num is null)),
      check ((undone_by is null) = (undone_at is null)),
      unique (household_id, id),
      unique (household_id, request_id)
    )
  `.execute(db);
  await sql`create index shopping_purchases_by_household on app.shopping_purchases (household_id, created_at desc)`.execute(
    db,
  );

  // Lets allocations reference an order item and its household together.
  await sql`alter table app.meal_order_items add constraint meal_order_items_household_item_key unique (household_id, id)`.execute(
    db,
  );

  // Deleted with the order item (a dish removed from a pending order); the purchase and its
  // history entry stay.
  await sql`
    create table app.shopping_allocations (
      household_id uuid not null,
      purchase_id uuid not null,
      order_item_id uuid not null,
      quantity_num bigint check (quantity_num > 0),
      quantity_den bigint check (quantity_den > 0),
      check ((quantity_num is null) = (quantity_den is null)),
      primary key (purchase_id, order_item_id),
      foreign key (household_id, purchase_id)
        references app.shopping_purchases(household_id, id) on delete cascade,
      foreign key (household_id, order_item_id)
        references app.meal_order_items(household_id, id) on delete cascade
    )
  `.execute(db);
  await sql`create index shopping_allocations_by_item on app.shopping_allocations (order_item_id)`.execute(
    db,
  );

  // Check and undo join the append-only audit record.
  await sql`
    alter table app.audit_events
      drop constraint audit_events_entity_type_check,
      drop constraint audit_events_action_check,
      add constraint audit_events_entity_type_check
        check (entity_type in ('meal_order', 'shopping_purchase')),
      add constraint audit_events_action_check
        check (action in ('create', 'update', 'complete', 'cancel', 'check', 'undo'))
  `.execute(db);
}

// Forward-only by design: a production rollback must not silently delete household data.
