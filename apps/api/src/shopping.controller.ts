import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import { parseScope, ShoppingService } from './shopping.service.js';

@ApiTags('Shopping')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Not found, or the caller is not a member of the household.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/shopping')
export class ShoppingController {
  constructor(private readonly shopping: ShoppingService) {}

  @Get()
  @ApiQuery({ name: 'from', required: false, description: 'First household-local meal date.' })
  @ApiQuery({ name: 'to', required: false, description: 'Last household-local meal date.' })
  @ApiOkResponse({
    description:
      'Ingredient demand of pending orders (all by default, including overdue ones): a combined list and the same demand grouped by meal date and order. Amounts are exact decimals; values that need rounding are rounded up and flagged approximate.',
  })
  @ApiBadRequestResponse({ description: 'Invalid date range.' })
  list(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shopping.list(session.userId, id, parseScope(from, to));
  }
}
