import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, type Database } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import {
  daysBetween,
  formatOffset,
  offsetMinutes,
  resolveLocal,
  toLocal,
  type LocalDateTime,
} from './local-time.js';
import { isUuid } from './security.js';

export const MAX_ORDER_ITEMS = 20;
export const MAX_PENDING_ORDERS = 200;
export const HISTORY_LIMIT = 100;
/** Orders may be planned (or recorded) up to a year either side of today, household time. */
export const SCHEDULE_WINDOW_DAYS = 366;

type Status = 'pending' | 'completed' | 'cancelled';
type Executor = Transaction<Database> | DatabaseService['db'];

export type When =
  | { type: 'now' }
  | { type: 'scheduled'; date: string; time: string; disambiguation?: 'earlier' | 'later' };

export interface NewItem {
  recipeId: string;
  servings: number;
}
export type UpdateItem = NewItem | { itemId: string; servings: number };

export interface OrderInput {
  when: When;
  notes: string;
}

function fail(message: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message, ...extra });
}

function servings(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    fail(`${field} must be a whole number from 1 to 100.`);
  }
  return value;
}

function uuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !isUuid(value)) fail(`${field} must be an id.`);
  return value.toLowerCase();
}

export function parseWhen(value: unknown): When {
  const when = (value ?? {}) as Record<string, unknown>;
  if (when.type === 'now') return { type: 'now' };
  if (when.type !== 'scheduled') fail('when.type must be "now" or "scheduled".');
  const date = when.date;
  const time = when.time;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail('when.date must be a date like 2026-10-03.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(year!, month! - 1, day!));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month! - 1) {
    fail('when.date is not a real calendar date.');
  }
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    fail('when.time must be a 24-hour time like 18:30.');
  }
  const disambiguation = when.disambiguation;
  if (disambiguation !== undefined && disambiguation !== 'earlier' && disambiguation !== 'later') {
    fail('when.disambiguation must be "earlier" or "later".');
  }
  return { type: 'scheduled', date, time, disambiguation };
}

export function parseOrderInput(body: unknown): OrderInput {
  const input = (body ?? {}) as Record<string, unknown>;
  let notes = '';
  if (input.notes !== undefined && input.notes !== null) {
    if (typeof input.notes !== 'string') fail('notes must be text.');
    notes = input.notes.trim();
    if (notes.length > 1000) fail('notes must be at most 1000 characters.');
  }
  return { when: parseWhen(input.when), notes };
}

function itemList(body: unknown) {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ORDER_ITEMS) {
    fail(`items must list 1 to ${MAX_ORDER_ITEMS} dishes.`);
  }
  return items.map((raw) => (raw ?? {}) as Record<string, unknown>);
}

export function parseNewItems(body: unknown): NewItem[] {
  return itemList(body).map((item, index) => ({
    recipeId: uuid(item.recipeId, `items[${index}].recipeId`),
    servings: servings(item.servings, `items[${index}].servings`),
  }));
}

/** Existing items are referenced by itemId (snapshot kept); new dishes by recipeId. */
export function parseUpdateItems(body: unknown): UpdateItem[] {
  const seen = new Set<string>();
  return itemList(body).map((item, index) => {
    const field = `items[${index}]`;
    const count = servings(item.servings, `${field}.servings`);
    if (item.itemId !== undefined) {
      if (item.recipeId !== undefined) fail(`${field} must have either itemId or recipeId.`);
      const itemId = uuid(item.itemId, `${field}.itemId`);
      if (seen.has(itemId)) fail(`${field}.itemId is listed twice.`);
      seen.add(itemId);
      return { itemId, servings: count };
    }
    return { recipeId: uuid(item.recipeId, `${field}.recipeId`), servings: count };
  });
}

export function parseStatusBody(body: unknown) {
  const revision = (body as { expectedRevision?: unknown } | null)?.expectedRevision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    fail('expectedRevision must be a positive whole number.');
  }
  return revision;
}

/**
 * Turns the requested meal time into an instant plus the household-local date and time.
 * Local times skipped by a daylight-saving change are rejected; repeated ones must say which
 * occurrence is meant. Nothing is silently shifted.
 */
export function resolveSchedule(when: When, timeZone: string, now = new Date()) {
  if (when.type === 'now') {
    return { instant: now, local: toLocal(now, timeZone) };
  }
  const local: LocalDateTime = { date: when.date, time: when.time };
  const today = toLocal(now, timeZone).date;
  if (Math.abs(daysBetween(today, local.date)) > SCHEDULE_WINDOW_DAYS) {
    fail('Choose a date within a year of today.');
  }
  const candidates = resolveLocal(local, timeZone);
  if (candidates.length === 0) {
    fail(
      `${local.time} does not exist on ${local.date} in ${timeZone} because the clocks move forward. Choose another time.`,
      { code: 'nonexistent_time' },
    );
  }
  if (candidates.length > 1) {
    const options = candidates.map((instant, index) => ({
      disambiguation: index === 0 ? 'earlier' : 'later',
      utcOffset: formatOffset(offsetMinutes(instant, timeZone)),
    }));
    if (!when.disambiguation) {
      fail(
        `${local.time} happens twice on ${local.date} in ${timeZone} because the clocks move back. Choose which one you mean.`,
        { code: 'ambiguous_time', options },
      );
    }
    return {
      instant: candidates[when.disambiguation === 'earlier' ? 0 : candidates.length - 1]!,
      local,
    };
  }
  return { instant: candidates[0]!, local };
}

/**
 * Household meal orders. Every current member may create, edit, complete or cancel any pending
 * order (confirmed collaboration rule). Mutations lock the caller's membership row, carry the
 * revision the caller last saw, and record a minimal audit event. Items are snapshots: editing
 * or archiving a recipe never changes an existing order or its history.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
  ) {}

  async list(userId: string, householdId: string, view: 'pending' | 'history') {
    await this.households.requireMember(userId, householdId);
    let query = this.orderColumns(this.database.db).where('o.household_id', '=', householdId);
    query =
      view === 'pending'
        ? query.where('o.status', '=', 'pending').orderBy('o.scheduled_at').orderBy('o.created_at')
        : query
            .where('o.status', '<>', 'pending')
            .orderBy('o.closed_at', 'desc')
            .limit(HISTORY_LIMIT);
    const orders = await query.execute();
    if (orders.length === 0) return [];
    const items = await this.database.db
      .selectFrom('app.meal_order_items')
      .select([
        'id',
        'order_id as orderId',
        'recipe_id as recipeId',
        'recipe_name as recipeName',
        'servings',
        'recipe_servings as recipeServings',
        'price_points as pricePoints',
      ])
      .where('household_id', '=', householdId)
      .where(
        'order_id',
        'in',
        orders.map((order) => order.id),
      )
      .orderBy('order_id')
      .orderBy('position')
      .execute();
    return orders.map((order) => {
      const own = items
        .filter((item) => item.orderId === order.id)
        .map((item) => ({
          id: item.id,
          recipeId: item.recipeId,
          recipeName: item.recipeName,
          servings: item.servings,
          recipeServings: item.recipeServings,
          pricePoints: item.pricePoints,
        }));
      return this.present(order, own);
    });
  }

  async get(userId: string, householdId: string, orderId: string) {
    await this.households.requireMember(userId, householdId);
    return this.detail(this.database.db, householdId, orderId);
  }

  async create(
    userId: string,
    householdId: string,
    input: OrderInput,
    items: NewItem[],
    requestId: string,
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      const existing = await trx
        .selectFrom('app.meal_orders')
        .select('id')
        .where('household_id', '=', householdId)
        .where('create_request_id', '=', requestId)
        .executeTakeFirst();
      if (existing) return this.detail(trx, householdId, existing.id);

      const { count } = await trx
        .selectFrom('app.meal_orders')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('household_id', '=', householdId)
        .where('status', '=', 'pending')
        .executeTakeFirstOrThrow();
      if (count >= MAX_PENDING_ORDERS) {
        throw new ConflictException(
          `A household can have up to ${MAX_PENDING_ORDERS} pending orders. Complete or cancel some first.`,
        );
      }
      const timezone = await this.timezone(trx, householdId);
      const schedule = resolveSchedule(input.when, timezone);
      const snapshots = await this.snapshots(trx, householdId, items);
      const order = await trx
        .insertInto('app.meal_orders')
        .values({
          household_id: householdId,
          scheduled_at: schedule.instant,
          meal_date: schedule.local.date,
          meal_time: schedule.local.time,
          timezone,
          notes: input.notes,
          create_request_id: requestId,
          created_by: userId,
          updated_by: userId,
        })
        .onConflict((conflict) =>
          conflict.columns(['household_id', 'create_request_id']).doNothing(),
        )
        .returning(['id', 'revision'])
        .executeTakeFirst();
      if (!order) {
        // A concurrent submission with the same request id committed first.
        const winner = await trx
          .selectFrom('app.meal_orders')
          .select('id')
          .where('household_id', '=', householdId)
          .where('create_request_id', '=', requestId)
          .executeTakeFirstOrThrow();
        return this.detail(trx, householdId, winner.id);
      }
      await this.insertItems(
        trx,
        householdId,
        order.id,
        snapshots.map((snapshot, position) => ({ ...snapshot, position })),
      );
      await this.audit(trx, householdId, userId, order.id, 'create', order.revision);
      return this.detail(trx, householdId, order.id);
    });
  }

  async update(
    userId: string,
    householdId: string,
    orderId: string,
    input: OrderInput,
    items: UpdateItem[],
    expectedRevision: number,
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      const current = await this.lockOrder(trx, householdId, orderId);
      if (current.status !== 'pending') {
        throw new ConflictException(
          `This order is ${current.status} and can no longer be changed.`,
        );
      }
      if (current.revision !== expectedRevision) throw this.staleConflict();

      const existingItems = await trx
        .selectFrom('app.meal_order_items')
        .select('id')
        .where('household_id', '=', householdId)
        .where('order_id', '=', orderId)
        .execute();
      const existingIds = new Set(existingItems.map((item) => item.id));
      items.forEach((item, index) => {
        if ('itemId' in item && !existingIds.has(item.itemId)) {
          fail(`items[${index}].itemId is not part of this order.`);
        }
      });
      const fresh = items.filter((item): item is NewItem => 'recipeId' in item);
      const snapshots = await this.snapshots(trx, householdId, fresh);
      const schedule = resolveSchedule(input.when, current.timezone);

      const kept = new Set(items.flatMap((item) => ('itemId' in item ? [item.itemId] : [])));
      const removed = [...existingIds].filter((id) => !kept.has(id));
      if (removed.length > 0) {
        await trx
          .deleteFrom('app.meal_order_items')
          .where('household_id', '=', householdId)
          .where('order_id', '=', orderId)
          .where('id', 'in', removed)
          .execute();
      }
      // Kept items change only servings and position; their snapshot columns are untouched.
      const newRows: (Awaited<ReturnType<typeof this.snapshots>>[number] & {
        position: number;
      })[] = [];
      let freshIndex = 0;
      for (const [position, item] of items.entries()) {
        if ('itemId' in item) {
          await trx
            .updateTable('app.meal_order_items')
            .set({ servings: item.servings, position })
            .where('id', '=', item.itemId)
            .where('order_id', '=', orderId)
            .execute();
        } else {
          newRows.push({ ...snapshots[freshIndex++]!, position });
        }
      }
      await this.insertItems(trx, householdId, orderId, newRows);
      const updated = await trx
        .updateTable('app.meal_orders')
        .set({
          scheduled_at: schedule.instant,
          meal_date: schedule.local.date,
          meal_time: schedule.local.time,
          notes: input.notes,
          revision: sql<number>`revision + 1`,
          updated_by: userId,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', orderId)
        .returning('revision')
        .executeTakeFirstOrThrow();
      await this.audit(trx, householdId, userId, orderId, 'update', updated.revision);
      return this.detail(trx, householdId, orderId);
    });
  }

  /**
   * Completes or cancels a pending order. Repeating the same action (double tap, retry, or two
   * members at once) returns the already-closed order without a second effect or audit event.
   */
  async close(
    userId: string,
    householdId: string,
    orderId: string,
    target: 'completed' | 'cancelled',
    expectedRevision: number,
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      const current = await this.lockOrder(trx, householdId, orderId);
      if (current.status === target) return this.detail(trx, householdId, orderId);
      if (current.status !== 'pending') {
        throw new ConflictException(`This order is already ${current.status}.`);
      }
      if (current.revision !== expectedRevision) throw this.staleConflict();
      const updated = await trx
        .updateTable('app.meal_orders')
        .set({
          status: target,
          closed_at: sql<Date>`now()`,
          closed_by: userId,
          revision: sql<number>`revision + 1`,
          updated_by: userId,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', orderId)
        .returning('revision')
        .executeTakeFirstOrThrow();
      await this.audit(
        trx,
        householdId,
        userId,
        orderId,
        target === 'completed' ? 'complete' : 'cancel',
        updated.revision,
      );
      return this.detail(trx, householdId, orderId);
    });
  }

  private staleConflict() {
    return new ConflictException(
      'Someone else changed this order after you opened it. Reload to see their version.',
    );
  }

  private async lockOrder(trx: Transaction<Database>, householdId: string, orderId: string) {
    if (!isUuid(orderId)) throw new NotFoundException('Order not found.');
    const order = await trx
      .selectFrom('app.meal_orders')
      .select(['status', 'revision', 'timezone'])
      .where('id', '=', orderId)
      .where('household_id', '=', householdId)
      .forUpdate()
      .executeTakeFirst();
    if (!order) throw new NotFoundException('Order not found.');
    return order as { status: Status; revision: number; timezone: string };
  }

  private async timezone(executor: Executor, householdId: string) {
    const household = await executor
      .selectFrom('app.households')
      .select('timezone')
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    return household.timezone;
  }

  /** Copies the current recipe content for each new item. Only active household recipes. */
  private async snapshots(trx: Transaction<Database>, householdId: string, items: NewItem[]) {
    if (items.length === 0) return [];
    const ids = [...new Set(items.map((item) => item.recipeId))];
    const recipes = await trx
      .selectFrom('app.recipes')
      .select(['id', 'name', 'servings', 'price_points', 'steps', 'revision', 'archived_at'])
      .where('household_id', '=', householdId)
      .where('id', 'in', ids)
      .execute();
    const ingredients = await trx
      .selectFrom('app.recipe_ingredients')
      .select(['recipe_id', 'name', 'ingredient_key', 'quantity', 'unit', 'form', 'note'])
      .where('household_id', '=', householdId)
      .where('recipe_id', 'in', ids)
      .orderBy('recipe_id')
      .orderBy('position')
      .execute();
    return items.map((item, index) => {
      const recipe = recipes.find((row) => row.id === item.recipeId);
      if (!recipe) fail(`items[${index}].recipeId is not a recipe on this household's menu.`);
      if (recipe.archived_at) {
        throw new ConflictException(`${recipe.name} is archived. Restore it before ordering it.`);
      }
      return {
        recipe_id: recipe.id,
        servings: item.servings,
        recipe_name: recipe.name,
        recipe_servings: recipe.servings,
        price_points: recipe.price_points,
        steps: recipe.steps,
        recipe_revision: recipe.revision,
        ingredients: JSON.stringify(
          ingredients
            .filter((line) => line.recipe_id === recipe.id)
            .map((line) => ({
              name: line.name,
              key: line.ingredient_key,
              quantity: line.quantity,
              unit: line.unit,
              form: line.form,
              note: line.note,
            })),
        ),
      };
    });
  }

  private async insertItems(
    trx: Transaction<Database>,
    householdId: string,
    orderId: string,
    rows: (Awaited<ReturnType<typeof this.snapshots>>[number] & { position: number })[],
  ) {
    if (rows.length === 0) return;
    await trx
      .insertInto('app.meal_order_items')
      .values(rows.map((row) => ({ ...row, household_id: householdId, order_id: orderId })))
      .execute();
  }

  private async audit(
    trx: Transaction<Database>,
    householdId: string,
    actorId: string,
    orderId: string,
    action: Database['app.audit_events']['action'],
    revision: number,
  ) {
    await trx
      .insertInto('app.audit_events')
      .values({
        household_id: householdId,
        actor_id: actorId,
        entity_type: 'meal_order',
        entity_id: orderId,
        action,
        revision,
      })
      .execute();
  }

  private orderColumns(executor: Executor) {
    return executor
      .selectFrom('app.meal_orders as o')
      .innerJoin('app.user_profiles as c', 'c.id', 'o.created_by')
      .innerJoin('app.user_profiles as u', 'u.id', 'o.updated_by')
      .leftJoin('app.user_profiles as x', 'x.id', 'o.closed_by')
      .select([
        'o.id',
        'o.status',
        'o.scheduled_at as scheduledAt',
        sql<string>`to_char(o.meal_date, 'YYYY-MM-DD')`.as('mealDate'),
        sql<string>`to_char(o.meal_time, 'HH24:MI')`.as('mealTime'),
        'o.timezone',
        'o.notes',
        'o.revision',
        'o.created_at as createdAt',
        'o.updated_at as updatedAt',
        'o.closed_at as closedAt',
        'c.display_name as createdBy',
        'u.display_name as updatedBy',
        'x.display_name as closedBy',
      ]);
  }

  private present<T extends { pricePoints: number; servings: number }>(
    order: {
      scheduledAt: Date;
      timezone: string;
    } & Record<string, unknown>,
    items: T[],
  ) {
    return {
      ...order,
      utcOffset: formatOffset(offsetMinutes(order.scheduledAt, order.timezone)),
      totalPoints: items.reduce((sum, item) => sum + item.pricePoints * item.servings, 0),
      items,
    };
  }

  private async detail(executor: Executor, householdId: string, orderId: string) {
    if (!isUuid(orderId)) throw new NotFoundException('Order not found.');
    const order = await this.orderColumns(executor)
      .where('o.id', '=', orderId)
      .where('o.household_id', '=', householdId)
      .executeTakeFirst();
    if (!order) throw new NotFoundException('Order not found.');
    const items = await executor
      .selectFrom('app.meal_order_items')
      .select([
        'id',
        'recipe_id as recipeId',
        'recipe_name as recipeName',
        'servings',
        'recipe_servings as recipeServings',
        'price_points as pricePoints',
        'steps',
        sql<
          {
            name: string;
            key: string;
            quantity: string | null;
            unit: string | null;
            form: string | null;
            note: string | null;
          }[]
        >`ingredients`.as('ingredients'),
        'recipe_revision as recipeRevision',
        'snapshot_at as snapshotAt',
      ])
      .where('household_id', '=', householdId)
      .where('order_id', '=', orderId)
      .orderBy('position')
      .execute();
    return this.present(order, items);
  }
}
