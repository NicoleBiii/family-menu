import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { before, after } from 'node:test';
import pg from 'pg';
import { migrate } from '../../scripts/migrate.mjs';
import { createApplication } from '../../apps/api/dist/app.js';
import { readConfig } from '../../apps/api/dist/config.js';

// Shared integration harness. The Supabase Auth HTTP endpoints are replaced by a local stub that
// implements the PKCE contract (authorize → code, token?grant_type=pkce with verifier check).
// The application code under test is the production code path; no login bypass exists.
// These tests do NOT prove real Google/Supabase behavior; that needs a provider smoke test.
//
// ES module bindings cannot be reassigned by importers, so mutable stub state lives on `stub`.

export const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('TEST_DATABASE_URL is required; integration tests must not silently skip.');
const parsed = new URL(databaseUrl);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
  parsed.pathname !== '/family_menu_test'
) {
  throw new Error('Tests require the dedicated loopback family_menu_test database.');
}

export const PUBLISHABLE_KEY = 'sb_publishable_test_only_not_a_real_key';
export const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
const issuedCodes = new Map();
export const stub = { nextIdentity: undefined, tokenStatusOverride: undefined };
let provider;
export const server = {
  origin: undefined,
  providerOrigin: undefined,
  /** The running application and the config object it was built from (AI tests adjust limits). */
  app: undefined,
  config: undefined,
};
let app;
let origin;

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  );
}

before(async () => {
  await migrate(databaseUrl);
  provider = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://stub');
    if (request.method === 'GET' && url.pathname === '/auth/v1/authorize') {
      assert.equal(url.searchParams.get('provider'), 'google');
      assert.equal(url.searchParams.get('code_challenge_method'), 's256');
      assert.equal(url.searchParams.get('prompt'), 'select_account');
      const code = randomUUID();
      issuedCodes.set(code, {
        challenge: url.searchParams.get('code_challenge'),
        identity: stub.nextIdentity,
      });
      const redirect = new URL(url.searchParams.get('redirect_to'));
      redirect.searchParams.set('code', code);
      response.writeHead(302, { Location: redirect.href }).end();
      return;
    }
    if (request.method === 'POST' && url.pathname === '/auth/v1/token') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      const issued = issuedCodes.get(body.auth_code);
      issuedCodes.delete(body.auth_code);
      const verifierOk =
        issued &&
        createHash('sha256').update(body.code_verifier).digest('base64url') === issued.challenge;
      if (
        stub.tokenStatusOverride ||
        url.searchParams.get('grant_type') !== 'pkce' ||
        request.headers.apikey !== PUBLISHABLE_KEY ||
        !verifierOk
      ) {
        response.writeHead(stub.tokenStatusOverride ?? 400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          access_token: 'provider-access-token-must-not-leak',
          refresh_token: 'provider-refresh-token-must-not-leak',
          user: {
            id: issued.identity.id,
            email: issued.identity.email,
            user_metadata: { full_name: issued.identity.name },
          },
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  const providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  server.providerOrigin = providerOrigin;

  // Reserve a port so APP_ORIGIN (used for callback and Origin checks) is known up front.
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server.origin = origin;
  const config = readConfig({
    DATABASE_URL: databaseUrl,
    APP_ORIGIN: origin,
    SUPABASE_URL: providerOrigin,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    // Deterministic local AI provider. The test database keeps every month's drafts, so the
    // budget is set far above what the suite can reserve; the budget test lowers it.
    AI_PROVIDER: 'mock',
    AI_MONTHLY_BUDGET_USD: '1000000',
  });
  ({ app } = await createApplication(config, true));
  server.app = app;
  server.config = config;
  await app.listen(port, '127.0.0.1');
});

after(async () => {
  await app?.close();
  await new Promise((resolve) => provider?.close(resolve));
  await pool.end();
});

export function cookiesFrom(response) {
  return Object.fromEntries(
    response.headers.getSetCookie().map((line) => {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))];
    }),
  );
}

export function identity(name = 'Test person') {
  return { id: randomUUID(), email: `${randomUUID()}@example.test`, name };
}

/** Walks the real redirect chain: /api/auth/login → provider authorize → /api/auth/callback. */
export async function startLogin(returnTo = '/') {
  const login = await fetch(`${origin}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: 'manual',
  });
  assert.equal(login.status, 302);
  const state = cookiesFrom(login).fm_oauth_state;
  assert.ok(state);
  const authorize = await fetch(login.headers.get('location'), { redirect: 'manual' });
  assert.equal(authorize.status, 302);
  return { state, callbackUrl: authorize.headers.get('location') };
}

export async function callback(callbackUrl, cookie) {
  return fetch(callbackUrl, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
}

export async function signIn(person = identity()) {
  stub.nextIdentity = person;
  const { state, callbackUrl } = await startLogin('/');
  const response = await callback(callbackUrl, `fm_oauth_state=${state}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  const token = cookiesFrom(response).fm_session;
  assert.ok(token, 'session cookie is issued');
  const cookie = `fm_session=${token}`;
  const session = await (
    await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie } })
  ).json();
  assert.equal(session.authenticated, true);
  return { ...person, token, cookie, csrf: session.csrfToken };
}

export function api(user, path, { method = 'GET', body, csrf = true, headers = {} } = {}) {
  return fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      ...(csrf && user && method !== 'GET' ? { 'X-CSRF-Token': user.csrf } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function createHousehold(user, name = 'Household') {
  const response = await api(user, '/households', { method: 'POST', body: { name } });
  assert.equal(response.status, 201);
  return response.json();
}

export async function invite(owner, householdId) {
  const response = await api(owner, `/households/${householdId}/invitations`, { method: 'POST' });
  assert.equal(response.status, 201);
  return response.json();
}
