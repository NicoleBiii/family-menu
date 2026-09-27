import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import {
  MAX_INGREDIENTS,
  MAX_STEPS,
  parseExpectedRevision,
  parseRecipeInput,
  parseRequestId,
  RecipesService,
  UNITS,
} from './recipes.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

const ingredientSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', maxLength: 100 },
    quantity: {
      type: 'string',
      nullable: true,
      description: 'Exact decimal, at most 3 fraction digits. Omit for "to taste" or unknown.',
      example: '0.5',
    },
    unit: { type: 'string', nullable: true, enum: [...UNITS] },
    form: { type: 'string', nullable: true, maxLength: 60, example: 'diced' },
    note: { type: 'string', nullable: true, maxLength: 200, example: 'to taste' },
  },
};

const recipeProperties = {
  name: { type: 'string', maxLength: 120 },
  description: { type: 'string', maxLength: 500 },
  servings: { type: 'integer', minimum: 1, maximum: 100, description: 'Base yield.' },
  pricePoints: {
    type: 'integer',
    minimum: 0,
    maximum: 9999,
    description: 'Virtual display points per serving. No cash value.',
  },
  steps: { type: 'array', maxItems: MAX_STEPS, items: { type: 'string', maxLength: 2000 } },
  ingredients: { type: 'array', maxItems: MAX_INGREDIENTS, items: ingredientSchema },
};

@ApiTags('Recipes')
@Controller('recipe-presets')
export class RecipePresetsController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @ApiOkResponse({
    description: 'Curated, read-only starter recipes. Public: they contain no household data.',
  })
  list() {
    return this.recipes.listPresets();
  }
}

@ApiTags('Recipes')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Not found, or the caller is not a member of the household.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  @ApiOkResponse({ description: 'All household recipes, including archived ones (flagged).' })
  list(@CurrentSession() session: AuthenticatedSession, @Param('householdId') id: string) {
    return this.recipes.list(session.userId, id);
  }

  @Post()
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['requestId', 'name', 'servings'],
      properties: {
        requestId: {
          type: 'string',
          format: 'uuid',
          description:
            'Client-generated per save; retrying with the same id returns the same recipe.',
        },
        presetId: {
          type: 'string',
          description: 'Set when the content started from a preset; records provenance.',
        },
        ...recipeProperties,
      },
    },
  })
  @ApiCreatedResponse({ description: 'Recipe saved to the household menu.' })
  @ApiBadRequestResponse({ description: 'Invalid recipe.' })
  @ApiConflictResponse({ description: 'The household reached its recipe limit.' })
  create(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Body() body: unknown,
  ) {
    return this.recipes.create(
      session.userId,
      id,
      parseRecipeInput(body),
      parseRequestId(body),
      (body as { presetId?: unknown } | null)?.presetId,
    );
  }

  @Get(':recipeId')
  @ApiOkResponse({ description: 'Recipe with ingredient lines in order.' })
  get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
  ) {
    return this.recipes.get(session.userId, id, recipeId);
  }

  @Put(':recipeId')
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['expectedRevision', 'name', 'servings'],
      properties: { expectedRevision: { type: 'integer', minimum: 1 }, ...recipeProperties },
    },
  })
  @ApiOkResponse({ description: 'Recipe replaced; revision incremented.' })
  @ApiBadRequestResponse({ description: 'Invalid recipe.' })
  @ApiConflictResponse({ description: 'Stale revision, or the recipe is archived.' })
  update(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    return this.recipes.update(
      session.userId,
      id,
      recipeId,
      parseRecipeInput(body),
      parseExpectedRevision(body),
    );
  }

  @Post(':recipeId/archive')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody(revisionBody())
  @ApiOkResponse({ description: 'Archived: hidden from new orders, never deleted.' })
  @ApiConflictResponse({ description: 'Stale revision, or already archived.' })
  archive(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    return this.recipes.setArchived(
      session.userId,
      id,
      recipeId,
      true,
      parseExpectedRevision(body),
    );
  }

  @Post(':recipeId/restore')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody(revisionBody())
  @ApiOkResponse({ description: 'Restored to the active menu.' })
  @ApiConflictResponse({ description: 'Stale revision, or not archived.' })
  restore(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
    @Body() body: unknown,
  ) {
    return this.recipes.setArchived(
      session.userId,
      id,
      recipeId,
      false,
      parseExpectedRevision(body),
    );
  }
}

function revisionBody() {
  return {
    schema: {
      type: 'object',
      required: ['expectedRevision'],
      properties: { expectedRevision: { type: 'integer', minimum: 1 } },
    },
  };
}
