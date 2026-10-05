import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, type Database } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import { ingredientKey } from './recipes.service.js';
import { isUuid } from './security.js';

export const MAX_CATEGORIES_PER_HOUSEHOLD = 30;
export const MAX_CATEGORY_NAME = 40;

function fail(message: string): never {
  throw new BadRequestException(message);
}

/** Same normalization as ingredient names: "Soups", " soups " and "ｓｏｕｐｓ" are one name. */
export const categoryKey = ingredientKey;

export function parseCategoryName(body: unknown) {
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || !name.trim()) fail('name is required.');
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length > MAX_CATEGORY_NAME) {
    fail(`name must be at most ${MAX_CATEGORY_NAME} characters.`);
  }
  return trimmed;
}

/** `moveTo` must be present: a category id, or null to leave the recipes Uncategorised. */
export function parseMoveTo(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!('moveTo' in input)) {
    fail('moveTo is required: another category id, or null for Uncategorised.');
  }
  if (input.moveTo === null) return null;
  if (typeof input.moveTo !== 'string' || !isUuid(input.moveTo)) {
    fail('moveTo must be a category id or null.');
  }
  return input.moveTo.toLowerCase();
}

/**
 * Household recipe categories (ADR 0007). Every member may create, rename and delete them
 * (shared-menu rule). A recipe has at most one category; deleting a category first moves its
 * recipes to a destination the member chose.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
  ) {}

  async list(userId: string, householdId: string) {
    await this.households.requireMember(userId, householdId);
    return this.rows(this.database.db, householdId);
  }

  /** Creating a name the household already has returns the existing category. */
  async create(userId: string, householdId: string, name: string) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      await trx
        .selectFrom('app.households')
        .select('id')
        .where('id', '=', householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const key = categoryKey(name);
      const existing = await this.findByKey(trx, householdId, key);
      if (existing) return this.one(trx, householdId, existing.id);
      const { count } = await trx
        .selectFrom('app.recipe_categories')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('household_id', '=', householdId)
        .executeTakeFirstOrThrow();
      if (count >= MAX_CATEGORIES_PER_HOUSEHOLD) {
        throw new ConflictException(
          `A household can keep up to ${MAX_CATEGORIES_PER_HOUSEHOLD} categories.`,
        );
      }
      const inserted = await trx
        .insertInto('app.recipe_categories')
        .values({
          household_id: householdId,
          name,
          name_key: key,
          created_by: userId,
          updated_by: userId,
        })
        .onConflict((conflict) => conflict.columns(['household_id', 'name_key']).doNothing())
        .returning('id')
        .executeTakeFirst();
      // A concurrent request created the same name first.
      const id = inserted?.id ?? (await this.findByKey(trx, householdId, key))!.id;
      return this.one(trx, householdId, id);
    });
  }

  /** Renaming keeps every recipe link, because recipes refer to the category by id. */
  async rename(userId: string, householdId: string, categoryId: string, name: string) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      await trx
        .selectFrom('app.households')
        .select('id')
        .where('id', '=', householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await this.lock(trx, householdId, categoryId);
      const key = categoryKey(name);
      const clash = await this.findByKey(trx, householdId, key);
      if (clash && clash.id !== categoryId) {
        throw new ConflictException('Another category already has this name.');
      }
      try {
        await trx
          .updateTable('app.recipe_categories')
          .set({ name, name_key: key, updated_by: userId, updated_at: sql<Date>`now()` })
          .where('household_id', '=', householdId)
          .where('id', '=', categoryId)
          .execute();
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('Another category already has this name.');
        }
        throw error;
      }
      return this.one(trx, householdId, categoryId);
    });
  }

  /**
   * Moves the category's recipes (archived ones too) to `moveTo`, or to Uncategorised when it is
   * null, then deletes the category. Moved recipes get a new revision so an editor still open on
   * one reports a conflict instead of saving the old category back.
   */
  async remove(userId: string, householdId: string, categoryId: string, moveTo: string | null) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      await trx
        .selectFrom('app.households')
        .select('id')
        .where('id', '=', householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await this.lock(trx, householdId, categoryId);
      if (moveTo !== null) {
        if (moveTo === categoryId) fail('moveTo must be a different category.');
        const destination = await trx
          .selectFrom('app.recipe_categories')
          .select('id')
          .where('household_id', '=', householdId)
          .where('id', '=', moveTo)
          .forKeyShare()
          .executeTakeFirst();
        if (!destination) fail('moveTo does not match a category in this household.');
      }
      const moved = await trx
        .updateTable('app.recipes')
        .set({
          category_id: moveTo,
          revision: sql<number>`revision + 1`,
          updated_by: userId,
          updated_at: sql<Date>`now()`,
        })
        .where('household_id', '=', householdId)
        .where('category_id', '=', categoryId)
        .executeTakeFirst();
      await trx
        .deleteFrom('app.recipe_categories')
        .where('household_id', '=', householdId)
        .where('id', '=', categoryId)
        .execute();
      return { moved: Number(moved.numUpdatedRows), moveTo };
    });
  }

  /** Locks the category against concurrent renames, deletions and new recipe links. */
  private async lock(trx: Transaction<Database>, householdId: string, categoryId: string) {
    if (!isUuid(categoryId)) throw new NotFoundException('Category not found.');
    const row = await trx
      .selectFrom('app.recipe_categories')
      .select('id')
      .where('household_id', '=', householdId)
      .where('id', '=', categoryId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Category not found.');
  }

  private findByKey(trx: Transaction<Database>, householdId: string, key: string) {
    return trx
      .selectFrom('app.recipe_categories')
      .select('id')
      .where('household_id', '=', householdId)
      .where('name_key', '=', key)
      .executeTakeFirst();
  }

  private rows(
    executor: Transaction<Database> | DatabaseService['db'],
    householdId: string,
    categoryId?: string,
  ) {
    let query = executor
      .selectFrom('app.recipe_categories as c')
      .select([
        'c.id',
        'c.name',
        sql<number>`(select count(*)::int from app.recipes r where r.household_id = c.household_id and r.category_id = c.id and r.archived_at is null)`.as(
          'recipeCount',
        ),
        sql<number>`(select count(*)::int from app.recipes r where r.household_id = c.household_id and r.category_id = c.id and r.archived_at is not null)`.as(
          'archivedCount',
        ),
      ])
      .where('c.household_id', '=', householdId);
    if (categoryId) query = query.where('c.id', '=', categoryId);
    return query
      .orderBy(sql`lower(c.name)`)
      .orderBy('c.created_at')
      .execute();
  }

  private async one(trx: Transaction<Database>, householdId: string, categoryId: string) {
    const [row] = await this.rows(trx, householdId, categoryId);
    if (!row) throw new NotFoundException('Category not found.');
    return row;
  }
}
