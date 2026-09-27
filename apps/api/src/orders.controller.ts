import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  MAX_ORDER_ITEMS,
  OrdersService,
  parseNewItems,
  parseOrderInput,
  parseStatusBody,
  parseUpdateItems,
} from './orders.service.js';
import { parseRequestId } from './recipes.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

const whenSchema = {
  type: 'object',
  required: ['type'],
  description:
    'Household-local meal time. A time skipped by a daylight-saving change is rejected (code nonexistent_time); a repeated one needs disambiguation (code ambiguous_time lists the options).',
  properties: {
    type: { type: 'string', enum: ['now', 'scheduled'] },
    date: { type: 'string', format: 'date', example: '2026-10-03' },
    time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '18:30' },
    disambiguation: { type: 'string', enum: ['earlier', 'later'] },
  },
};
const notesSchema = { type: 'string', maxLength: 1000 };
const revisionBody = {
  schema: {
    type: 'object',
    required: ['expectedRevision'],
    properties: { expectedRevision: { type: 'integer', minimum: 1 } },
  },
};

@ApiTags('Meal orders')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Not found, or the caller is not a member of the household.' })
@UseGuards(SessionGuard)
@Controller('households/:householdId/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiQuery({ name: 'view', required: false, enum: ['pending', 'history'] })
  @ApiOkResponse({
    description:
      'Pending orders by meal time (default), or the 100 most recently completed/cancelled.',
  })
  list(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Query('view') view?: string,
  ) {
    if (view !== undefined && view !== 'pending' && view !== 'history') {
      throw new BadRequestException('view must be "pending" or "history".');
    }
    return this.orders.list(session.userId, id, view ?? 'pending');
  }

  @Post()
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['requestId', 'when', 'items'],
      properties: {
        requestId: {
          type: 'string',
          format: 'uuid',
          description: 'Client-generated per submission; a retry returns the same order.',
        },
        when: whenSchema,
        notes: notesSchema,
        items: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ORDER_ITEMS,
          items: {
            type: 'object',
            required: ['recipeId', 'servings'],
            properties: {
              recipeId: { type: 'string', format: 'uuid' },
              servings: { type: 'integer', minimum: 1, maximum: 100 },
            },
          },
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Pending order with a snapshot of each recipe.' })
  @ApiBadRequestResponse({ description: 'Invalid input, unknown recipe, or unusable local time.' })
  @ApiConflictResponse({ description: 'A recipe is archived, or too many pending orders.' })
  create(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Body() body: unknown,
  ) {
    return this.orders.create(
      session.userId,
      id,
      parseOrderInput(body),
      parseNewItems(body),
      parseRequestId(body),
    );
  }

  @Get(':orderId')
  @ApiOkResponse({ description: 'Order with full item snapshots (ingredients and steps).' })
  get(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('orderId') orderId: string,
  ) {
    return this.orders.get(session.userId, id, orderId);
  }

  @Put(':orderId')
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['expectedRevision', 'when', 'items'],
      properties: {
        expectedRevision: { type: 'integer', minimum: 1 },
        when: whenSchema,
        notes: notesSchema,
        items: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ORDER_ITEMS,
          description:
            'Full list in order. Keep an item (and its snapshot) with itemId; add a dish with recipeId (fresh snapshot). Omitted items are removed.',
          items: {
            type: 'object',
            required: ['servings'],
            properties: {
              itemId: { type: 'string', format: 'uuid' },
              recipeId: { type: 'string', format: 'uuid' },
              servings: { type: 'integer', minimum: 1, maximum: 100 },
            },
          },
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Order updated; revision incremented.' })
  @ApiBadRequestResponse({ description: 'Invalid input or unusable local time.' })
  @ApiConflictResponse({ description: 'Stale revision, or the order is no longer pending.' })
  update(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    return this.orders.update(
      session.userId,
      id,
      orderId,
      parseOrderInput(body),
      parseUpdateItems(body),
      parseStatusBody(body),
    );
  }

  @Post(':orderId/complete')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody(revisionBody)
  @ApiOkResponse({ description: 'Completed (or already completed: no second effect).' })
  @ApiConflictResponse({ description: 'Stale revision, or the order was cancelled.' })
  complete(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    return this.orders.close(session.userId, id, orderId, 'completed', parseStatusBody(body));
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  @ApiHeader(csrfHeader)
  @ApiBody(revisionBody)
  @ApiOkResponse({ description: 'Cancelled (or already cancelled: no second effect).' })
  @ApiConflictResponse({ description: 'Stale revision, or the order was completed.' })
  cancel(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    return this.orders.close(session.userId, id, orderId, 'cancelled', parseStatusBody(body));
  }
}
