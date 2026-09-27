import { BadRequestException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import { buildShoppingList, type SnapshotLine } from './shopping.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseScope(from: unknown, to: unknown) {
  const check = (value: unknown, name: string) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${name} must be a date like 2026-10-03.`);
    }
    return value;
  };
  const scope = { from: check(from, 'from'), to: check(to, 'to') };
  if (scope.from && scope.to && scope.from > scope.to) {
    throw new BadRequestException('from must not be after to.');
  }
  return scope;
}

/**
 * Shopping demand for a household, derived only from pending order snapshots. One SQL statement
 * reads every row, so both views share one consistent database snapshot.
 */
@Injectable()
export class ShoppingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
  ) {}

  async list(userId: string, householdId: string, scope: { from?: string; to?: string }) {
    await this.households.requireMember(userId, householdId);
    let query = this.database.db
      .selectFrom('app.meal_order_items as i')
      .innerJoin('app.meal_orders as o', (join) =>
        join.onRef('o.id', '=', 'i.order_id').onRef('o.household_id', '=', 'i.household_id'),
      )
      .select([
        'o.id as orderId',
        sql<string>`to_char(o.meal_date, 'YYYY-MM-DD')`.as('mealDate'),
        sql<string>`to_char(o.meal_time, 'HH24:MI')`.as('mealTime'),
        'o.scheduled_at as scheduledAt',
        'i.id as itemId',
        'i.recipe_name as recipeName',
        'i.servings',
        'i.recipe_servings as recipeServings',
        sql<SnapshotLine[]>`i.ingredients`.as('ingredients'),
        sql<Date>`now()`.as('generatedAt'),
      ])
      .where('o.household_id', '=', householdId)
      .where('o.status', '=', 'pending');
    if (scope.from) query = query.where('o.meal_date', '>=', scope.from);
    if (scope.to) query = query.where('o.meal_date', '<=', scope.to);
    const rows = await query
      .orderBy('o.scheduled_at')
      .orderBy('o.created_at')
      .orderBy('o.id')
      .orderBy('i.position')
      .execute();
    const list = buildShoppingList(rows);
    return {
      scope: { from: scope.from ?? null, to: scope.to ?? null },
      generatedAt: rows[0]?.generatedAt ?? new Date(),
      orderCount: new Set(rows.map((row) => row.orderId)).size,
      ...list,
    };
  }
}
