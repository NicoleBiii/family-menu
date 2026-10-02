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
  CategoriesService,
  MAX_CATEGORY_NAME,
  parseCategoryName,
  parseMoveTo,
} from './categories.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

const nameBody = {
  schema: {
    type: 'object',
    required: ['name'],
    properties: { name: { type: 'string', maxLength: MAX_CATEGORY_NAME, example: 'Soups' } },
  },
};

@ApiTags('Recipes')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Not found, or the caller is not a member of the household.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({
    description: 'Household categories by name, with active and archived recipe counts.',
  })
  list(@CurrentSession() session: AuthenticatedSession, @Param('householdId') id: string) {
    return this.categories.list(session.userId, id);
  }

  @Post()
  @ApiHeader(csrfHeader)
  @ApiBody(nameBody)
  @ApiCreatedResponse({
    description: 'The category; an existing one when the household already has this name.',
  })
  @ApiBadRequestResponse({ description: 'Missing or too long name.' })
  @ApiConflictResponse({ description: 'The household reached its category limit.' })
  create(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Body() body: unknown,
  ) {
    return this.categories.create(session.userId, id, parseCategoryName(body));
  }

  @Put(':categoryId')
  @ApiHeader(csrfHeader)
  @ApiBody(nameBody)
  @ApiOkResponse({ description: 'Renamed; recipe links are kept.' })
  @ApiConflictResponse({ description: 'Another category already has this name.' })
  rename(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('categoryId') categoryId: string,
    @Body() body: unknown,
  ) {
    return this.categories.rename(session.userId, id, categoryId, parseCategoryName(body));
  }

  @Post(':categoryId/delete')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['moveTo'],
      properties: {
        moveTo: {
          type: 'string',
          format: 'uuid',
          nullable: true,
          description: 'Category that receives this category’s recipes, or null for Uncategorised.',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Recipes moved (with new revisions) and the category deleted.' })
  @ApiBadRequestResponse({ description: 'moveTo is missing, the same category or not found.' })
  remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('categoryId') categoryId: string,
    @Body() body: unknown,
  ) {
    return this.categories.remove(session.userId, id, categoryId, parseMoveTo(body));
  }
}
