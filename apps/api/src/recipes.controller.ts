import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import {
  acceptedFormat,
  MAX_UPLOAD_BYTES,
  normalizeImage,
  readLimitedBody,
  RecipeImagesService,
} from './recipe-images.service.js';
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
  categoryId: {
    type: 'string',
    format: 'uuid',
    nullable: true,
    description:
      'Household category, or null for Uncategorised. Omitted: new recipes are Uncategorised and updates keep the current category.',
  },
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
  constructor(
    private readonly recipes: RecipesService,
    private readonly images: RecipeImagesService,
  ) {}

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

  @Put(':recipeId/image')
  @ApiHeader(csrfHeader)
  @ApiConsumes('image/jpeg', 'image/png', 'image/webp')
  @ApiBody({
    description: `Raw image bytes, at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Re-encoded to WebP within 1024 × 1024 without metadata.`,
    schema: { type: 'string', format: 'binary' },
  })
  @ApiOkResponse({ description: 'Photo stored; returns its new immutable id.' })
  @ApiBadRequestResponse({ description: 'Empty or unreadable image.' })
  @ApiConflictResponse({ description: 'The recipe is archived.' })
  @ApiPayloadTooLargeResponse({ description: 'Upload larger than the limit.' })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not a JPEG, PNG or WebP image.' })
  async putImage(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
    @Req() request: Request,
  ) {
    const format = acceptedFormat(request.headers['content-type']);
    await this.images.assertWritable(session.userId, id, recipeId);
    const image = await normalizeImage(await readLimitedBody(request), format);
    return this.images.replace(session.userId, id, recipeId, image);
  }

  @Delete(':recipeId/image')
  @HttpCode(204)
  @ApiHeader(csrfHeader)
  @ApiNoContentResponse({ description: 'Photo removed.' })
  @ApiConflictResponse({ description: 'The recipe is archived.' })
  async deleteImage(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
  ) {
    await this.images.remove(session.userId, id, recipeId);
  }

  @Get(':recipeId/image/:imageId')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @ApiProduces('image/webp')
  @ApiOkResponse({
    description: 'The photo. Ids change on every upload, so responses are immutable.',
  })
  async getImage(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('recipeId') recipeId: string,
    @Param('imageId') imageId: string,
  ) {
    const image = await this.images.read(session.userId, id, recipeId, imageId);
    return new StreamableFile(image.content, {
      type: image.content_type,
      length: image.content.length,
      disposition: 'inline',
    });
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
