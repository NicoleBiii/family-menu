import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MAX_DISH_NAME, MAX_PREFERENCES } from './ai-providers.js';
import { AiDraftsService, parseDraftCreate } from './ai-drafts.service.js';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import { parseRecipeInput } from './recipes.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

@ApiTags('AI drafts')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Not found, or the caller is not a member of the household.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/ai-drafts')
export class AiDraftsController {
  constructor(private readonly drafts: AiDraftsService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Whether AI drafts are on, the household allowance left in the last 24 hours, and recent open drafts.',
  })
  overview(@CurrentSession() session: AuthenticatedSession, @Param('householdId') id: string) {
    return this.drafts.overview(session.userId, id);
  }

  @Post()
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['requestId', 'dishName'],
      properties: {
        requestId: {
          type: 'string',
          format: 'uuid',
          description: 'Client-generated; retrying with the same id returns the same draft.',
        },
        dishName: { type: 'string', maxLength: MAX_DISH_NAME },
        preferences: { type: 'string', maxLength: MAX_PREFERENCES },
      },
    },
  })
  @ApiAcceptedResponse({ description: 'Draft queued; poll it until it succeeds or fails.' })
  @ApiOkResponse({ description: 'The draft this requestId already created.' })
  @ApiBadRequestResponse({ description: 'Invalid input.' })
  @ApiTooManyRequestsResponse({ description: 'Household or personal limit reached (code).' })
  @ApiServiceUnavailableResponse({
    description:
      'AI drafts are off (ai_disabled) or the monthly budget is used (budget_exhausted).',
  })
  async create(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.drafts.create(session.userId, id, parseDraftCreate(body));
    response.status(result.created ? 202 : 200);
    return result.draft;
  }

  @Get(':draftId')
  @ApiOkResponse({ description: 'The draft and its status.' })
  get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('draftId') draftId: string,
  ) {
    return this.drafts.get(session.userId, id, draftId);
  }

  @Post(':draftId/save')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody({ description: 'The recipe as the member edited it (same fields as a new recipe).' })
  @ApiOkResponse({ description: 'The saved household recipe; saving again returns the same one.' })
  @ApiBadRequestResponse({ description: 'Invalid recipe.' })
  @ApiConflictResponse({ description: 'The draft was discarded or is not ready.' })
  save(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('draftId') draftId: string,
    @Body() body: unknown,
  ) {
    return this.drafts.save(session.userId, id, draftId, parseRecipeInput(body));
  }

  @Post(':draftId/discard')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiOkResponse({ description: 'Discarded; the menu is unchanged.' })
  @ApiConflictResponse({ description: 'The draft was already saved.' })
  discard(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('draftId') draftId: string,
  ) {
    return this.drafts.discard(session.userId, id, draftId);
  }
}
