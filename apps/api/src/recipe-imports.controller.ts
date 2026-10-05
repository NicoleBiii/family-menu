import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_RECIPES,
  RecipeImportsService,
} from './recipe-imports.service.js';

@ApiTags('Recipe imports')
@ApiCookieAuth()
@ApiNotFoundResponse({ description: 'Household not found or not a member.' })
@ApiBadRequestResponse({ description: 'Invalid JSON document or selection.' })
@ApiPayloadTooLargeResponse({ description: 'Import request exceeds 512 KiB.' })
@ApiTooManyRequestsResponse({ description: 'Per-household import request rate exceeded.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/recipe-imports')
export class RecipeImportsController {
  constructor(private readonly imports: RecipeImportsService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          description: `Version 1 JSON, containing 1–${MAX_IMPORT_RECIPES} recipes. Maximum request size ${MAX_IMPORT_BYTES} bytes.`,
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Validated rows, duplicates, categories and household capacity; no recipes or categories saved.',
  })
  async preview(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') householdId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.imports.preview(session.userId, householdId, body);
    } catch (error) {
      this.retryHeader(error, response);
      throw error;
    }
  }

  @Post()
  @HttpCode(200)
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['text', 'requestId', 'selected', 'categoryChoices', 'stateHash'],
      properties: {
        text: { type: 'string' },
        requestId: { type: 'string', format: 'uuid' },
        selected: {
          type: 'array',
          items: { type: 'integer' },
          minItems: 1,
          maxItems: MAX_IMPORT_RECIPES,
        },
        keepDuplicates: { type: 'array', items: { type: 'integer' } },
        categoryChoices: {
          type: 'object',
          additionalProperties: {
            type: 'string',
            description: 'create, none or household category UUID',
          },
        },
        stateHash: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Atomic import receipt. Retrying the same request ID and intent returns the receipt.',
  })
  @ApiConflictResponse({
    description: 'Preview became stale, capacity exceeded or request ID was reused.',
  })
  async commit(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') householdId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.imports.commit(session.userId, householdId, body);
    } catch (error) {
      this.retryHeader(error, response);
      throw error;
    }
  }

  private retryHeader(error: unknown, response: Response) {
    if (error instanceof HttpException && error.getStatus() === 429)
      response.setHeader('Retry-After', '60');
  }
}
