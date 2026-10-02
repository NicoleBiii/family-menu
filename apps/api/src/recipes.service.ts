import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { DatabaseService, type Database } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import { findPreset, RECIPE_PRESETS } from './presets.js';
import { isUuid } from './security.js';

export const MAX_RECIPES_PER_HOUSEHOLD = 500;
export const MAX_INGREDIENTS = 60;
export const MAX_STEPS = 30;

/**
 * Fixed-unit vocabulary. Mass/volume units have known conversions for the shopping list; count
 * units (and a blank unit, meaning "whole items") are only summed with the identical unit.
 */
export const UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'clove',
  'slice',
  'can',
  'bunch',
  'pinch',
] as const;
export type Unit = (typeof UNITS)[number];

export interface IngredientInput {
  name: string;
  /** Exact decimal string with at most three fraction digits, or null for "to taste"/unknown. */
  quantity: string | null;
  unit: Unit | null;
  form: string | null;
  note: string | null;
}

export interface RecipeInput {
  name: string;
  description: string;
  servings: number;
  pricePoints: number;
  steps: string[];
  ingredients: IngredientInput[];
  /**
   * Household category id, or null for Uncategorised. Undefined means the caller did not send
   * one: a new recipe is then Uncategorised and an update keeps the current category.
   */
  categoryId?: string | null;
}

type Executor = Transaction<Database> | DatabaseService['db'];

export type RecipeProvenance =
  | { source: 'manual' }
  | { source: 'preset'; preset: NonNullable<ReturnType<typeof findPreset>> }
  | { source: 'ai'; draftId: string };

function fail(message: string): never {
  throw new BadRequestException(message);
}

function text(value: unknown, field: string, max: number, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    fail(`${field} is required.`);
  }
  if (typeof value !== 'string') fail(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    if (optional) return null;
    fail(`${field} is required.`);
  }
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters.`);
  return trimmed;
}

function integer(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

/**
 * Accepts a JSON number or decimal string and returns a normalized decimal string, e.g. 0.50 → "0.5".
 * Values that cannot be written exactly with three fraction digits (such as 0.1 + 0.2) are rejected
 * rather than rounded, so no amount is silently changed.
 */
export function parseQuantity(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== 'string') fail(`${field} must be a number.`);
  const match = /^(0|[1-9]\d{0,5})(?:\.(\d{1,3}))?$/.exec(raw.trim());
  if (!match) fail(`${field} must be a positive number with at most 3 decimal places.`);
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  const whole = match[1]!;
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  const numeric = Number(normalized);
  if (numeric <= 0 || numeric > 100000) fail(`${field} must be greater than 0 and at most 100000.`);
  return normalized;
}

/** Normalized identity used to group the same ingredient across recipes. */
export function ingredientKey(name: string) {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseRecipeInput(body: unknown): RecipeInput {
  const input = (body ?? {}) as Record<string, unknown>;
  const steps = input.steps ?? [];
  if (!Array.isArray(steps) || steps.length > MAX_STEPS) {
    fail(`steps must be a list of at most ${MAX_STEPS} entries.`);
  }
  const ingredients = input.ingredients ?? [];
  if (!Array.isArray(ingredients) || ingredients.length > MAX_INGREDIENTS) {
    fail(`ingredients must be a list of at most ${MAX_INGREDIENTS} entries.`);
  }
  let categoryId: string | null | undefined;
  if (input.categoryId === null || input.categoryId === '') categoryId = null;
  else if (input.categoryId !== undefined) {
    if (typeof input.categoryId !== 'string' || !isUuid(input.categoryId)) {
      fail('categoryId must be a category id or null.');
    }
    categoryId = input.categoryId.toLowerCase();
  }
  return {
    categoryId,
    name: text(input.name, 'name', 120)!,
    description: text(input.description, 'description', 500, { optional: true }) ?? '',
    servings: integer(input.servings, 'servings', 1, 100),
    pricePoints: integer(input.pricePoints ?? 0, 'pricePoints', 0, 9999),
    steps: steps.map((step, index) => text(step, `steps[${index}]`, 2000)!),
    ingredients: ingredients.map((raw, index) => {
      const field = `ingredients[${index}]`;
      const line = (raw ?? {}) as Record<string, unknown>;
      const quantity = parseQuantity(line.quantity, `${field}.quantity`);
      let unit: Unit | null = null;
      if (line.unit !== undefined && line.unit !== null && line.unit !== '') {
        if (!UNITS.includes(line.unit as Unit)) {
          fail(`${field}.unit must be one of: ${UNITS.join(', ')}.`);
        }
        unit = line.unit as Unit;
        if (quantity === null) fail(`${field}.unit needs a quantity.`);
      }
      return {
        name: text(line.name, `${field}.name`, 100)!,
        quantity,
        unit,
        form: text(line.form, `${field}.form`, 60, { optional: true }),
        note: text(line.note, `${field}.note`, 200, { optional: true }),
      };
    }),
  };
}

export function parseRequestId(body: unknown) {
  const requestId = (body as { requestId?: unknown } | null)?.requestId;
  if (typeof requestId !== 'string' || !isUuid(requestId)) {
    fail('requestId must be a UUID generated by the client for this save.');
  }
  return requestId.toLowerCase();
}

export function parseExpectedRevision(body: unknown) {
  return integer(
    (body as { expectedRevision?: unknown } | null)?.expectedRevision,
    'expectedRevision',
    1,
    2_147_483_647,
  );
}

/**
 * Household menu. Every member may create and edit every recipe (confirmed shared-menu rule).
 * Writes lock the caller's membership row and require the revision the caller last saw, so a
 * stale edit is reported as a conflict instead of overwriting another member's change.
 */
@Injectable()
export class RecipesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
  ) {}

  listPresets() {
    return RECIPE_PRESETS.map((preset) => ({
      ...preset,
      ingredients: preset.ingredients.map((line) => ({ ...line })),
      steps: [...preset.steps],
    }));
  }

  async list(userId: string, householdId: string) {
    await this.households.requireMember(userId, householdId);
    const rows = await this.database.db
      .selectFrom('app.recipes as r')
      .select([
        'r.id',
        'r.name',
        'r.description',
        'r.servings',
        'r.price_points as pricePoints',
        'r.source',
        'r.source_preset_id as presetId',
        'r.category_id as categoryId',
        'r.revision',
        'r.updated_at as updatedAt',
        'r.archived_at as archivedAt',
        sql<number>`(select count(*)::int from app.recipe_ingredients i where i.recipe_id = r.id)`.as(
          'ingredientCount',
        ),
        sql<string | null>`(select m.id from app.recipe_images m where m.recipe_id = r.id)`.as(
          'imageId',
        ),
        sql<{
          provider: 'pexels';
          sourceUrl: string;
          photographer: string;
          photographerUrl: string;
        } | null>`(
          select json_build_object('provider', m.source_provider, 'sourceUrl', m.source_url,
            'photographer', m.photographer, 'photographerUrl', m.photographer_url)
          from app.recipe_images m where m.recipe_id = r.id and m.source_provider is not null
        )`.as('imageCredit'),
      ])
      .where('r.household_id', '=', householdId)
      .orderBy(sql`lower(r.name)`)
      .orderBy('r.created_at')
      .execute();
    return rows.map(({ archivedAt, ...row }) => ({ ...row, archived: archivedAt !== null }));
  }

  async get(userId: string, householdId: string, recipeId: string) {
    await this.households.requireMember(userId, householdId);
    return this.detail(this.database.db, householdId, recipeId);
  }

  async create(
    userId: string,
    householdId: string,
    input: RecipeInput,
    requestId: string,
    presetId?: unknown,
  ) {
    let preset: ReturnType<typeof findPreset>;
    if (presetId !== undefined && presetId !== null) {
      preset = findPreset(presetId);
      if (!preset) fail('presetId does not match a preset.');
    }
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      return this.insertRecipe(
        trx,
        userId,
        householdId,
        input,
        requestId,
        preset ? { source: 'preset', preset } : { source: 'manual' },
      );
    });
  }

  /**
   * Inserts a recipe inside the caller's transaction; the caller has already locked the
   * membership. A retried save (double tap, network retry) with the same request id returns the
   * recipe the first attempt created.
   */
  async insertRecipe(
    trx: Transaction<Database>,
    userId: string,
    householdId: string,
    input: RecipeInput,
    requestId: string,
    provenance: RecipeProvenance,
  ) {
    const existing = await trx
      .selectFrom('app.recipes')
      .select('id')
      .where('household_id', '=', householdId)
      .where('create_request_id', '=', requestId)
      .executeTakeFirst();
    if (existing) return this.detail(trx, householdId, existing.id);

    const { count } = await trx
      .selectFrom('app.recipes')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('household_id', '=', householdId)
      .executeTakeFirstOrThrow();
    if (count >= MAX_RECIPES_PER_HOUSEHOLD) {
      throw new ConflictException(
        `A household can keep up to ${MAX_RECIPES_PER_HOUSEHOLD} recipes.`,
      );
    }
    const categoryId = await this.resolveCategory(trx, householdId, input.categoryId ?? null);
    const inserted = await trx
      .insertInto('app.recipes')
      .values({
        household_id: householdId,
        category_id: categoryId,
        name: input.name,
        description: input.description,
        servings: input.servings,
        price_points: input.pricePoints,
        steps: input.steps,
        source: provenance.source,
        source_preset_id: provenance.source === 'preset' ? provenance.preset.id : null,
        source_preset_version: provenance.source === 'preset' ? provenance.preset.version : null,
        source_ai_draft_id: provenance.source === 'ai' ? provenance.draftId : null,
        create_request_id: requestId,
        created_by: userId,
        updated_by: userId,
      })
      .onConflict((conflict) => conflict.columns(['household_id', 'create_request_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) {
      // A concurrent request with the same id committed first.
      const winner = await trx
        .selectFrom('app.recipes')
        .select('id')
        .where('household_id', '=', householdId)
        .where('create_request_id', '=', requestId)
        .executeTakeFirstOrThrow();
      return this.detail(trx, householdId, winner.id);
    }
    await this.insertIngredients(trx, householdId, inserted.id, input.ingredients);
    return this.detail(trx, householdId, inserted.id);
  }

  async update(
    userId: string,
    householdId: string,
    recipeId: string,
    input: RecipeInput,
    expectedRevision: number,
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      if (!isUuid(recipeId)) throw new NotFoundException('Recipe not found.');
      const categoryId =
        input.categoryId === undefined
          ? undefined
          : await this.resolveCategory(trx, householdId, input.categoryId);
      const updated = await trx
        .updateTable('app.recipes')
        .set({
          ...(categoryId === undefined ? {} : { category_id: categoryId }),
          name: input.name,
          description: input.description,
          servings: input.servings,
          price_points: input.pricePoints,
          steps: input.steps,
          revision: sql<number>`revision + 1`,
          updated_by: userId,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', recipeId)
        .where('household_id', '=', householdId)
        .where('revision', '=', expectedRevision)
        .where('archived_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!updated) await this.explainRejectedWrite(trx, householdId, recipeId, true);
      await trx
        .deleteFrom('app.recipe_ingredients')
        .where('household_id', '=', householdId)
        .where('recipe_id', '=', recipeId)
        .execute();
      await this.insertIngredients(trx, householdId, recipeId, input.ingredients);
      return this.detail(trx, householdId, recipeId);
    });
  }

  /** Archiving hides a recipe from new orders; it is never a hard delete. */
  async setArchived(
    userId: string,
    householdId: string,
    recipeId: string,
    archived: boolean,
    expectedRevision: number,
  ) {
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      if (!isUuid(recipeId)) throw new NotFoundException('Recipe not found.');
      const updated = await trx
        .updateTable('app.recipes')
        .set({
          archived_at: archived ? sql<Date>`now()` : null,
          revision: sql<number>`revision + 1`,
          updated_by: userId,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', recipeId)
        .where('household_id', '=', householdId)
        .where('revision', '=', expectedRevision)
        .where('archived_at', archived ? 'is' : 'is not', null)
        .returning('id')
        .executeTakeFirst();
      if (!updated) await this.explainRejectedWrite(trx, householdId, recipeId, archived);
      return this.detail(trx, householdId, recipeId);
    });
  }

  /**
   * Confirms a category belongs to the household. `FOR KEY SHARE` makes a concurrent category
   * deletion wait for this write, or makes this write see the deletion and fail with 400.
   */
  private async resolveCategory(
    trx: Transaction<Database>,
    householdId: string,
    categoryId: string | null,
  ) {
    if (categoryId === null) return null;
    const category = await trx
      .selectFrom('app.recipe_categories')
      .select('id')
      .where('household_id', '=', householdId)
      .where('id', '=', categoryId)
      .forKeyShare()
      .executeTakeFirst();
    if (!category) fail('categoryId does not match a category in this household.');
    return category.id;
  }

  private async explainRejectedWrite(
    trx: Transaction<Database>,
    householdId: string,
    recipeId: string,
    mustBeActive: boolean,
  ): Promise<never> {
    const current = await trx
      .selectFrom('app.recipes')
      .select(['revision', 'archived_at'])
      .where('id', '=', recipeId)
      .where('household_id', '=', householdId)
      .executeTakeFirst();
    if (!current) throw new NotFoundException('Recipe not found.');
    if (mustBeActive && current.archived_at) {
      throw new ConflictException('This recipe is archived. Restore it before editing.');
    }
    if (!mustBeActive && !current.archived_at) {
      throw new ConflictException('This recipe is not archived.');
    }
    throw new ConflictException(
      'Someone else changed this recipe after you opened it. Reload to see their version.',
    );
  }

  private async insertIngredients(
    trx: Transaction<Database>,
    householdId: string,
    recipeId: string,
    ingredients: IngredientInput[],
  ) {
    if (ingredients.length === 0) return;
    await trx
      .insertInto('app.recipe_ingredients')
      .values(
        ingredients.map((line, position) => ({
          household_id: householdId,
          recipe_id: recipeId,
          position,
          name: line.name,
          ingredient_key: ingredientKey(line.name),
          quantity: line.quantity,
          unit: line.unit,
          form: line.form,
          note: line.note,
        })),
      )
      .execute();
  }

  async detail(executor: Executor, householdId: string, recipeId: string) {
    if (!isUuid(recipeId)) throw new NotFoundException('Recipe not found.');
    const recipe = await executor
      .selectFrom('app.recipes as r')
      .innerJoin('app.user_profiles as c', 'c.id', 'r.created_by')
      .innerJoin('app.user_profiles as u', 'u.id', 'r.updated_by')
      .select([
        'r.id',
        'r.name',
        'r.description',
        'r.servings',
        'r.price_points as pricePoints',
        'r.steps',
        'r.source',
        'r.source_preset_id as presetId',
        'r.source_preset_version as presetVersion',
        'r.category_id as categoryId',
        'r.revision',
        'r.created_at as createdAt',
        'r.updated_at as updatedAt',
        'r.archived_at as archivedAt',
        'c.display_name as createdBy',
        'u.display_name as updatedBy',
        sql<string | null>`(select m.id from app.recipe_images m where m.recipe_id = r.id)`.as(
          'imageId',
        ),
        sql<{
          provider: 'pexels';
          sourceUrl: string;
          photographer: string;
          photographerUrl: string;
        } | null>`(
          select json_build_object('provider', m.source_provider, 'sourceUrl', m.source_url,
            'photographer', m.photographer, 'photographerUrl', m.photographer_url)
          from app.recipe_images m where m.recipe_id = r.id and m.source_provider is not null
        )`.as('imageCredit'),
      ])
      .where('r.id', '=', recipeId)
      .where('r.household_id', '=', householdId)
      .executeTakeFirst();
    if (!recipe) throw new NotFoundException('Recipe not found.');
    const ingredients = await executor
      .selectFrom('app.recipe_ingredients')
      .select(['name', 'quantity', 'unit', 'form', 'note'])
      .where('household_id', '=', householdId)
      .where('recipe_id', '=', recipeId)
      .orderBy('position')
      .execute();
    const { archivedAt, ...rest } = recipe;
    return { ...rest, archived: archivedAt !== null, ingredients };
  }
}
