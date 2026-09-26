import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseService } from './database.service.js';
import { IdentityExchangeError, SupabaseIdentityProvider } from './identity-provider.js';
import { pkceChallenge, randomToken, sha256 } from './security.js';

export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_IDLE_SECONDS = 14 * 24 * 60 * 60;
export const OAUTH_STATE_SECONDS = 10 * 60;
const TOUCH_INTERVAL_SECONDS = 5 * 60;

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  csrfToken: string;
}

export type CallbackFailure = 'state_invalid' | 'provider_denied' | 'exchange_failed';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provider: SupabaseIdentityProvider,
  ) {}

  get configured() {
    return this.provider.configured;
  }

  /** Creates a single-use login state and returns the provider URL plus the browser-bound state. */
  async beginLogin(returnTo: string) {
    const state = randomToken();
    const verifier = randomToken(48);
    const db = this.database.db;
    await db.deleteFrom('app.oauth_states').where('expires_at', '<', new Date()).execute();
    await db
      .insertInto('app.oauth_states')
      .values({
        state_hash: sha256(state),
        code_verifier: verifier,
        return_to: returnTo,
        expires_at: new Date(Date.now() + OAUTH_STATE_SECONDS * 1000),
      })
      .execute();
    return { state, url: this.provider.authorizationUrl(pkceChallenge(verifier)) };
  }

  /**
   * Consumes the login state (even on failure) and exchanges the code.
   * Returns a new session token or the failure category for the redirect.
   */
  async completeLogin(
    state: string | undefined,
    code: string | undefined,
    providerError: string | undefined,
  ): Promise<
    { ok: true; token: string; returnTo: string } | { ok: false; reason: CallbackFailure }
  > {
    if (!state) return { ok: false, reason: 'state_invalid' };
    const consumed = await this.database.db
      .deleteFrom('app.oauth_states')
      .where('state_hash', '=', sha256(state))
      .returning(['code_verifier', 'return_to', 'expires_at'])
      .executeTakeFirst();
    if (!consumed || consumed.expires_at.getTime() <= Date.now()) {
      return { ok: false, reason: 'state_invalid' };
    }
    if (providerError || !code) return { ok: false, reason: 'provider_denied' };
    if (code.length > 512) return { ok: false, reason: 'exchange_failed' };

    let identity;
    try {
      identity = await this.provider.exchange(code, consumed.code_verifier);
    } catch (error) {
      if (error instanceof IdentityExchangeError) return { ok: false, reason: 'exchange_failed' };
      throw error;
    }
    const token = await this.database.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('app.user_profiles')
        .values({ id: identity.userId, display_name: identity.displayName, email: identity.email })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({ email: identity.email, updated_at: new Date() }),
        )
        .execute();
      const sessionToken = randomToken();
      await trx
        .insertInto('app.sessions')
        .values({
          token_hash: sha256(sessionToken),
          user_id: identity.userId,
          csrf_token: randomToken(),
          expires_at: new Date(Date.now() + SESSION_ABSOLUTE_SECONDS * 1000),
        })
        .execute();
      return sessionToken;
    });
    return { ok: true, token, returnTo: consumed.return_to };
  }

  async resolveSession(token: string | undefined): Promise<AuthenticatedSession | null> {
    if (!token || token.length > 200) return null;
    const row = await this.database.db
      .selectFrom('app.sessions')
      .select(['id', 'user_id', 'csrf_token', 'last_seen_at'])
      .where('token_hash', '=', sha256(token))
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', sql<Date>`now()`)
      .where('last_seen_at', '>', sql<Date>`now() - make_interval(secs => ${SESSION_IDLE_SECONDS})`)
      .executeTakeFirst();
    if (!row) return null;
    if (Date.now() - row.last_seen_at.getTime() > TOUCH_INTERVAL_SECONDS * 1000) {
      await this.database.db
        .updateTable('app.sessions')
        .set({ last_seen_at: sql`now()` })
        .where('id', '=', row.id)
        .execute();
    }
    return { sessionId: row.id, userId: row.user_id, csrfToken: row.csrf_token };
  }

  async revokeSession(token: string | undefined) {
    if (!token || token.length > 200) return;
    await this.database.db
      .updateTable('app.sessions')
      .set({ revoked_at: sql`now()` })
      .where('token_hash', '=', sha256(token))
      .where('revoked_at', 'is', null)
      .execute();
  }

  async profile(userId: string) {
    return this.database.db
      .selectFrom('app.user_profiles')
      .select(['id', 'display_name as displayName', 'email'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
  }
}
