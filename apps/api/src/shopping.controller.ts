import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import {
  parsePurchase,
  parseScope,
  PURCHASE_HISTORY_LIMIT,
  ShoppingService,
} from './shopping.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

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
      'Ingredient demand of pending orders (all by default, including overdue ones): a combined list and the same demand grouped by meal date and order. Amounts are exact decimals; values that need rounding are rounded up and flagged approximate. `checklist` splits the combined demand into checkable lines (ingredient, form, unit family) with what is still to buy and what members already bought (ADR 0009).',
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

  @Get('purchases')
  @ApiOkResponse({
    description: `The household's latest ${PURCHASE_HISTORY_LIMIT} purchases, newest first, including undone ones.`,
  })
  purchases(@CurrentSession() session: AuthenticatedSession, @Param('householdId') id: string) {
    return this.shopping.listPurchases(session.userId, id);
  }

  @Post('purchases')
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['requestId', 'lineId', 'token'],
      properties: {
        requestId: {
          type: 'string',
          format: 'uuid',
          description:
            'Client-generated per check; retrying with the same id records one purchase.',
        },
        lineId: { type: 'string', description: 'From the checklist line.' },
        token: { type: 'string', description: 'From the checklist line the member saw.' },
        from: { type: 'string', format: 'date', description: 'Scope used for the list.' },
        to: { type: 'string', format: 'date' },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'The purchase: the line’s remaining amount, allocated to the order items in scope.',
  })
  @ApiConflictResponse({
    description: 'code shopping_changed: the line changed since it was loaded; nothing recorded.',
  })
  purchase(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Body() body: unknown,
  ) {
    return this.shopping.purchase(session.userId, id, parsePurchase(body));
  }

  @Post('purchases/:purchaseId/undo')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiOkResponse({ description: 'The purchase, now undone; repeating has no further effect.' })
  undo(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('purchaseId') purchaseId: string,
  ) {
    return this.shopping.undo(session.userId, id, purchaseId);
  }
}
