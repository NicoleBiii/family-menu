import { BadRequestException, ConflictException, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { categoryKey, MAX_CATEGORIES_PER_HOUSEHOLD } from './categories.service.js';
import { DatabaseService, type Database } from './database.service.js';
import { HouseholdsService } from './households.service.js';
import {
  MAX_RECIPES_PER_HOUSEHOLD,
  parseRecipeInput,
  parseRequestId,
  RecipesService,
  type RecipeInput,
} from './recipes.service.js';
import { isUuid } from './security.js';

export const MAX_IMPORT_RECIPES = 50;
export const MAX_IMPORT_BYTES = 512 * 1024;

type Row = {
  index: number;
  name: string;
  category: string | null;
  recipe: RecipeInput | null;
  errors: string[];
};
type Category = { id: string; name: string; name_key: string };
type ExistingRecipe = { id: string; name: string; archived_at: Date | null };
type Snapshot = {
  categories: Category[];
  recipes: ExistingRecipe[];
  count: number;
  stateHash: string;
};

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function unknownFields(value: Record<string, unknown>, allowed: string[], path: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new BadRequestException(`${path}.${unknown} is not supported.`);
}

function readText(body: unknown) {
  const input = object(body, 'request');
  if (typeof input.text !== 'string') throw new BadRequestException('text must be JSON text.');
  if (Buffer.byteLength(input.text, 'utf8') > MAX_IMPORT_BYTES) {
    throw new HttpException('Import text is too large.', 413);
  }
  return input.text;
}

function parseDocument(text: string): Row[] {
  let clean = text.replace(/^\uFEFF/, '').trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(clean);
  if (fence) clean = fence[1]!;
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new BadRequestException('Paste one complete JSON document without commentary.');
  }
  const document = object(parsed, 'document');
  unknownFields(document, ['version', 'recipes'], 'document');
  if (document.version !== 1) throw new BadRequestException('Unsupported import version. Use 1.');
  if (
    !Array.isArray(document.recipes) ||
    document.recipes.length < 1 ||
    document.recipes.length > MAX_IMPORT_RECIPES
  ) {
    throw new BadRequestException(`recipes must contain 1 to ${MAX_IMPORT_RECIPES} entries.`);
  }
  return document.recipes.map((raw, index) => {
    const errors: string[] = [];
    let recipe: RecipeInput | null = null;
    let category: string | null = null;
    let name = `#${index + 1}`;
    try {
      const input = object(raw, `recipes[${index}]`);
      unknownFields(
        input,
        ['name', 'category', 'description', 'servings', 'pricePoints', 'steps', 'ingredients'],
        `recipes[${index}]`,
      );
      if (input.category !== undefined && input.category !== null) {
        if (
          typeof input.category !== 'string' ||
          !input.category.trim() ||
          input.category.trim().length > 40 ||
          categoryKey(input.category).length > 40
        ) {
          throw new BadRequestException(`recipes[${index}].category must be 1 to 40 characters.`);
        }
        category = input.category.trim().replace(/\s+/g, ' ');
      }
      if (Array.isArray(input.ingredients)) {
        input.ingredients.forEach((line, ingredientIndex) => {
          unknownFields(
            object(line, `recipes[${index}].ingredients[${ingredientIndex}]`),
            ['name', 'quantity', 'unit', 'form', 'note'],
            `recipes[${index}].ingredients[${ingredientIndex}]`,
          );
        });
      }
      recipe = parseRecipeInput(input);
      name = recipe.name;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid recipe.');
      if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string')
        name = (raw as { name: string }).name.slice(0, 120);
    }
    return { index, name, category, recipe, errors };
  });
}

function importRecipeId(requestId: string, index: number) {
  const bytes = createHash('sha256').update(`${requestId}:${index}`).digest();
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** External-assistant JSON remains untrusted until every selected row is revalidated at commit. */
@Injectable()
export class RecipeImportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly households: HouseholdsService,
    private readonly recipes: RecipesService,
  ) {}

  private async limit(householdId: string, kind: 'preview' | 'commit') {
    const result = await sql<{ request_count: number }>`
      insert into app.recipe_import_rate_windows (household_id, kind, window_started_at, request_count)
      values (${householdId}::uuid, ${kind}, now(), 1)
      on conflict (household_id, kind) do update set
        window_started_at = case when app.recipe_import_rate_windows.window_started_at <= now() - interval '1 minute'
          then now() else app.recipe_import_rate_windows.window_started_at end,
        request_count = case when app.recipe_import_rate_windows.window_started_at <= now() - interval '1 minute'
          then 1 else app.recipe_import_rate_windows.request_count + 1 end
      returning request_count
    `.execute(this.database.db);
    if ((result.rows[0]?.request_count ?? 0) > (kind === 'preview' ? 20 : 5)) {
      throw new HttpException('Too many imports. Try again in one minute.', 429);
    }
  }

  private async snapshot(
    householdId: string,
    trx: Transaction<Database> | DatabaseService['db'],
  ): Promise<Snapshot> {
    const [categories, recipes] = await Promise.all([
      trx
        .selectFrom('app.recipe_categories')
        .select(['id', 'name', 'name_key'])
        .where('household_id', '=', householdId)
        .orderBy('id')
        .execute(),
      trx
        .selectFrom('app.recipes')
        .select(['id', 'name', 'archived_at'])
        .where('household_id', '=', householdId)
        .orderBy('id')
        .execute(),
    ]);
    return {
      categories,
      recipes,
      count: recipes.length,
      stateHash: hash({ categories, recipes: recipes.map((r) => [r.id, r.name, !!r.archived_at]) }),
    };
  }

  async preview(userId: string, householdId: string, body: unknown) {
    await this.households.requireMember(userId, householdId);
    await this.limit(householdId, 'preview');
    const rows = parseDocument(readText(body));
    const snapshot = await this.snapshot(householdId, this.database.db);
    const seen = new Set<string>();
    return {
      stateHash: snapshot.stateHash,
      remainingRecipes: Math.max(0, MAX_RECIPES_PER_HOUSEHOLD - snapshot.count),
      remainingCategories: Math.max(0, MAX_CATEGORIES_PER_HOUSEHOLD - snapshot.categories.length),
      categories: snapshot.categories.map(({ id, name }) => ({ id, name })),
      rows: rows.map((row) => {
        const key = categoryKey(row.name);
        const existing = snapshot.recipes.find((r) => categoryKey(r.name) === key);
        const withinBatch = seen.has(key);
        if (row.recipe) seen.add(key);
        const matchingCategory = snapshot.categories.find(
          (c) => c.name_key === categoryKey(row.category ?? ''),
        );
        return {
          index: row.index,
          name: row.name,
          category: row.category,
          recipe: row.recipe,
          errors: row.errors,
          duplicate: existing
            ? existing.archived_at
              ? 'archived'
              : 'existing'
            : withinBatch
              ? 'batch'
              : null,
          matchingCategoryId: matchingCategory?.id ?? null,
        };
      }),
    };
  }

  async commit(userId: string, householdId: string, body: unknown) {
    const input = object(body, 'request');
    const text = readText(body);
    const requestId = parseRequestId(body);
    if (
      !Array.isArray(input.selected) ||
      input.selected.length < 1 ||
      input.selected.some((n) => !Number.isInteger(n) || n < 0 || n >= MAX_IMPORT_RECIPES) ||
      new Set(input.selected).size !== input.selected.length
    ) {
      throw new BadRequestException('selected must contain distinct recipe indices.');
    }
    const selected = input.selected as number[];
    const keepDuplicates = input.keepDuplicates ?? [];
    if (!Array.isArray(keepDuplicates) || keepDuplicates.some((n) => !selected.includes(n))) {
      throw new BadRequestException('keepDuplicates must be selected recipe indices.');
    }
    const mappings = object(input.categoryChoices, 'categoryChoices');
    const intentHash = hash({ text, selected, keepDuplicates, mappings });
    await this.households.requireMember(userId, householdId);
    const completed = await this.database.db
      .selectFrom('app.recipe_imports')
      .select(['intent_hash', 'result'])
      .where('household_id', '=', householdId)
      .where('request_id', '=', requestId)
      .executeTakeFirst();
    if (completed) {
      if (completed.intent_hash !== intentHash)
        throw new ConflictException(
          'This import request ID was already used for different content.',
        );
      return completed.result as unknown;
    }
    // Rate accounting uses a separate connection, before the transaction's household row lock.
    await this.limit(householdId, 'commit');
    return this.database.db.transaction().execute(async (trx) => {
      await this.households.requireMember(userId, householdId, trx, true);
      // One shared capacity lock; individual recipe and category creation use the same row.
      await trx
        .selectFrom('app.households')
        .select('id')
        .where('id', '=', householdId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const previous = await trx
        .selectFrom('app.recipe_imports')
        .select(['intent_hash', 'result'])
        .where('household_id', '=', householdId)
        .where('request_id', '=', requestId)
        .executeTakeFirst();
      if (previous) {
        if (previous.intent_hash !== intentHash)
          throw new ConflictException(
            'This import request ID was already used for different content.',
          );
        return previous.result as unknown;
      }
      const rows = parseDocument(text);
      if (selected.some((index) => index >= rows.length || rows[index]!.recipe === null)) {
        throw new BadRequestException(
          'Selected recipes contain errors. Review them before importing.',
        );
      }
      const snapshot = await this.snapshot(householdId, trx);
      if (typeof input.stateHash !== 'string' || input.stateHash !== snapshot.stateHash) {
        throw new ConflictException('The household menu changed. Check the import preview again.');
      }
      if (snapshot.count + selected.length > MAX_RECIPES_PER_HOUSEHOLD) {
        throw new ConflictException('The household recipe limit would be exceeded.');
      }
      const byName = new Set(snapshot.recipes.map((r) => categoryKey(r.name)));
      const keep = new Set(keepDuplicates as number[]);
      for (const index of selected) {
        const key = categoryKey(rows[index]!.name);
        if (byName.has(key) && !keep.has(index))
          throw new ConflictException(
            `Recipe ${index + 1} already exists. Review duplicate choices.`,
          );
        byName.add(key);
      }
      const categoryIds = new Map(snapshot.categories.map((c) => [c.name_key, c.id]));
      const required = new Map<string, string>();
      for (const index of selected) {
        const name = rows[index]!.category;
        if (name) required.set(categoryKey(name), name);
      }
      const chosen = new Map<string, string | null>();
      let createdCategories = 0;
      for (const [key, name] of required) {
        const choice = mappings[key];
        if (choice === 'none') {
          chosen.set(key, null);
          continue;
        }
        if (choice === 'create') {
          const existing = categoryIds.get(key);
          if (existing) {
            chosen.set(key, existing);
            continue;
          }
          if (snapshot.categories.length + createdCategories >= MAX_CATEGORIES_PER_HOUSEHOLD) {
            throw new ConflictException('The household category limit would be exceeded.');
          }
          const result = await trx
            .insertInto('app.recipe_categories')
            .values({
              household_id: householdId,
              name,
              name_key: key,
              created_by: userId,
              updated_by: userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          categoryIds.set(key, result.id);
          chosen.set(key, result.id);
          createdCategories++;
          continue;
        }
        if (
          typeof choice === 'string' &&
          isUuid(choice) &&
          snapshot.categories.some((c) => c.id === choice)
        ) {
          chosen.set(key, choice);
          continue;
        }
        throw new BadRequestException(`Choose a category mapping for ${name}.`);
      }
      const recipeIds: string[] = [];
      for (const index of selected) {
        const row = rows[index]!;
        const result = await this.recipes.insertRecipe(
          trx,
          userId,
          householdId,
          {
            ...row.recipe!,
            categoryId: row.category ? (chosen.get(categoryKey(row.category)) ?? null) : null,
          },
          importRecipeId(requestId, index),
          { source: 'manual' },
        );
        recipeIds.push(result.id);
      }
      const result = { requestId, imported: recipeIds.length, createdCategories, recipeIds };
      await trx
        .insertInto('app.recipe_imports')
        .values({
          household_id: householdId,
          request_id: requestId,
          created_by: userId,
          intent_hash: intentHash,
          result: JSON.stringify(result),
        })
        .execute();
      return result;
    });
  }
}
