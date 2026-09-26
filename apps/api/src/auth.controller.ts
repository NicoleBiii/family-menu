import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentSession, SessionGuard } from './auth.guard.js';
import {
  AuthService,
  OAUTH_STATE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  type AuthenticatedSession,
} from './auth.service.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { HouseholdsService } from './households.service.js';
import { clearCookie, cookieNames, readCookie, safeReturnTo, setCookie } from './security.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookies;

  constructor(
    private readonly auth: AuthService,
    private readonly households: HouseholdsService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.cookies = cookieNames(config.appOrigin);
  }

  @Get('login')
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Same-site path to open after sign-in.',
  })
  @ApiFoundResponse({ description: 'Redirects to Google sign-in through Supabase Auth.' })
  @ApiServiceUnavailableResponse({ description: 'Sign-in is not configured on this server.' })
  async login(@Query('returnTo') returnTo: unknown, @Res() response: Response) {
    if (!this.auth.configured) throw new ServiceUnavailableException('Sign-in is not configured.');
    const { state, url } = await this.auth.beginLogin(safeReturnTo(returnTo));
    setCookie(response, this.cookies.oauthState, state, OAUTH_STATE_SECONDS, this.cookies.secure);
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, url);
  }

  @Get('callback')
  @ApiFoundResponse({
    description:
      'Completes sign-in and redirects to the requested page, or to /?authError=<reason> on failure.',
  })
  async callback(
    @Query('code') code: unknown,
    @Query('error') error: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!this.auth.configured) {
      response.redirect(302, '/?authError=not_configured');
      return;
    }
    const state = readCookie(request, this.cookies.oauthState);
    clearCookie(response, this.cookies.oauthState, this.cookies.secure);
    const result = await this.auth.completeLogin(
      state,
      typeof code === 'string' ? code : undefined,
      typeof error === 'string' ? error : undefined,
    );
    if (!result.ok) {
      response.redirect(302, `/?authError=${result.reason}`);
      return;
    }
    // Rotate: never keep a pre-existing session identifier across a new sign-in.
    await this.auth.revokeSession(readCookie(request, this.cookies.session));
    setCookie(
      response,
      this.cookies.session,
      result.token,
      SESSION_ABSOLUTE_SECONDS,
      this.cookies.secure,
    );
    response.redirect(302, result.returnTo);
  }

  @Get('session')
  @ApiOkResponse({
    description:
      'The signed-in user, CSRF token for state-changing requests, and household memberships; or {authenticated:false}.',
  })
  async session(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const session = await this.auth.resolveSession(readCookie(request, this.cookies.session));
    if (!session) return { authenticated: false, signInAvailable: this.auth.configured };
    return {
      authenticated: true,
      user: await this.auth.profile(session.userId),
      csrfToken: session.csrfToken,
      households: await this.households.listForUser(session.userId),
    };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'The session is revoked and its cookie cleared.' })
  async logout(
    @CurrentSession() _session: AuthenticatedSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.revokeSession(readCookie(request, this.cookies.session));
    clearCookie(response, this.cookies.session, this.cookies.secure);
  }
}
