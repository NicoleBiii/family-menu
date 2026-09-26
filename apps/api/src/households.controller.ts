import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import type { AuthenticatedSession } from './auth.service.js';
import {
  HouseholdsService,
  parseHouseholdInput,
  parseInvitationToken,
} from './households.service.js';

const csrfHeader = {
  name: 'X-CSRF-Token',
  required: true,
  description: 'Required on state-changing requests; returned by GET /api/auth/session.',
};

@ApiTags('Households')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@UseGuards(SessionGuard)
@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get()
  @ApiOkResponse({ description: 'Households the caller belongs to.' })
  list(@CurrentSession() session: AuthenticatedSession) {
    return this.households.listForUser(session.userId);
  }

  @Post()
  @ApiHeader(csrfHeader)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', maxLength: 100 }, timezone: { type: 'string' } },
    },
  })
  @ApiCreatedResponse({ description: 'Household created with the caller as owner.' })
  @ApiBadRequestResponse({ description: 'Invalid name or time zone.' })
  create(@CurrentSession() session: AuthenticatedSession, @Body() body: unknown) {
    return this.households.create(session.userId, parseHouseholdInput(body));
  }

  @Get(':householdId')
  @ApiOkResponse({ description: 'Household details and members.' })
  @ApiNotFoundResponse({ description: 'Not found or the caller is not a member.' })
  detail(@CurrentSession() session: AuthenticatedSession, @Param('householdId') id: string) {
    return this.households.detail(session.userId, id);
  }

  @Delete(':householdId/members/:userId')
  @HttpCode(204)
  @ApiHeader(csrfHeader)
  @ApiNoContentResponse({ description: 'Member removed, or the caller left the household.' })
  @ApiForbiddenResponse({ description: 'Only the owner can remove other members.' })
  @ApiConflictResponse({ description: 'The owner cannot leave.' })
  async removeMember(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('userId') userId: string,
  ) {
    await this.households.removeMember(session.userId, id, userId);
  }

  @Post(':householdId/invitations')
  @ApiHeader(csrfHeader)
  @ApiCreatedResponse({
    description: 'Single-use invitation link, valid for 7 days. The token is shown only once.',
  })
  @ApiForbiddenResponse({ description: 'Only the owner can invite.' })
  createInvitation(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
  ) {
    return this.households.createInvitation(session.userId, id);
  }

  @Get(':householdId/invitations')
  @ApiOkResponse({ description: 'Active (unused, unexpired, unrevoked) invitations.' })
  listInvitations(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
  ) {
    return this.households.listInvitations(session.userId, id);
  }

  @Delete(':householdId/invitations/:invitationId')
  @HttpCode(204)
  @ApiHeader(csrfHeader)
  @ApiNoContentResponse({ description: 'Invitation revoked.' })
  async revokeInvitation(
    @CurrentSession() session: AuthenticatedSession,
    @Param('householdId') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    await this.households.revokeInvitation(session.userId, id, invitationId);
  }
}

const tokenBody = {
  schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
};

@ApiTags('Invitations')
@ApiCookieAuth()
@ApiHeader(csrfHeader)
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({ description: 'Unknown invitation.' })
@ApiGoneResponse({ description: 'Expired, revoked or already used invitation.' })
@UseGuards(SessionGuard)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiBody(tokenBody)
  @ApiOkResponse({ description: 'Household name and expiry for a usable invitation.' })
  preview(@CurrentSession() session: AuthenticatedSession, @Body() body: unknown) {
    return this.households.previewInvitation(session.userId, parseInvitationToken(body));
  }

  @Post('accept')
  @HttpCode(200)
  @ApiBody(tokenBody)
  @ApiOkResponse({ description: 'Joined (or already a member of) the household.' })
  accept(@CurrentSession() session: AuthenticatedSession, @Body() body: unknown) {
    return this.households.acceptInvitation(session.userId, parseInvitationToken(body));
  }
}
