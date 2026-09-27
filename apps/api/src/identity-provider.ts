import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './config.js';
import { isUuid } from './security.js';

export interface VerifiedIdentity {
  /** Stable Supabase Auth user id; used as the app profile id. */
  userId: string;
  email: string | null;
  displayName: string;
}

export class IdentityExchangeError extends Error {}

/**
 * Supabase Auth (GoTrue) PKCE flow, called server-side only.
 * The browser never receives provider tokens; after a successful code exchange
 * the API creates its own HttpOnly session and discards the provider tokens.
 */
@Injectable()
export class SupabaseIdentityProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.auth && this.config.appOrigin);
  }

  callbackUrl(): string {
    return `${this.config.appOrigin}/api/auth/callback`;
  }

  /**
   * The login state is bound to the browser by an HttpOnly cookie rather than a query
   * parameter so that redirect_to matches the Supabase allow list exactly. PKCE binds the
   * returned code to the verifier stored for that cookie.
   */
  authorizationUrl(codeChallenge: string): string {
    const auth = this.requireConfig();
    const url = new URL('/auth/v1/authorize', auth.supabaseUrl);
    url.searchParams.set('provider', 'google');
    url.searchParams.set('redirect_to', this.callbackUrl());
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 's256');
    url.searchParams.set('scopes', 'openid email profile');
    // Supabase forwards extra query parameters to Google. Always show the account chooser so
    // that signing out and back in on a shared family device does not silently reuse whichever
    // Google account the browser is already signed in to.
    url.searchParams.set('prompt', 'select_account');
    return url.href;
  }

  async exchange(code: string, codeVerifier: string): Promise<VerifiedIdentity> {
    const auth = this.requireConfig();
    let response: Response;
    try {
      response = await fetch(new URL('/auth/v1/token?grant_type=pkce', auth.supabaseUrl), {
        method: 'POST',
        headers: { apikey: auth.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new IdentityExchangeError('Identity provider unreachable.');
    }
    if (!response.ok)
      throw new IdentityExchangeError(`Code exchange rejected (${response.status}).`);
    const body = (await response.json().catch(() => null)) as {
      user?: {
        id?: unknown;
        email?: unknown;
        user_metadata?: { full_name?: unknown; name?: unknown };
      };
    } | null;
    const user = body?.user;
    if (!user || !isUuid(user.id)) throw new IdentityExchangeError('Malformed identity response.');
    const email = typeof user.email === 'string' && user.email.length <= 320 ? user.email : null;
    const candidates = [
      user.user_metadata?.full_name,
      user.user_metadata?.name,
      email?.split('@')[0],
    ];
    const name = candidates.find(
      (value): value is string => typeof value === 'string' && !!value.trim(),
    );
    return {
      userId: user.id.toLowerCase(),
      email,
      displayName: (name ?? 'Family member').trim().slice(0, 100),
    };
  }

  private requireConfig() {
    if (!this.config.auth || !this.config.appOrigin) throw new Error('Sign-in is not configured.');
    return this.config.auth;
  }
}
