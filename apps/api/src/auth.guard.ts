import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthenticatedSession } from './auth.service.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { cookieNames, readCookie, safeEqual } from './security.js';

type AuthenticatedRequest = Request & { auth?: AuthenticatedSession };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Requires a valid server-side session. For state-changing methods it also requires the
 * per-session CSRF token in X-CSRF-Token and, when the browser sends one, a matching Origin.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.resolveSession(
      readCookie(request, cookieNames(this.config.appOrigin).session),
    );
    if (!session) throw new UnauthorizedException('Sign in to continue.');
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin && origin !== this.config.appOrigin) {
        throw new ForbiddenException('Cross-origin request rejected.');
      }
      const token = request.headers['x-csrf-token'];
      if (typeof token !== 'string' || !safeEqual(token, session.csrfToken)) {
        throw new ForbiddenException('Missing or invalid CSRF token.');
      }
    }
    request.auth = session;
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession => {
    const session = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!session) throw new UnauthorizedException('Sign in to continue.');
    return session;
  },
);
