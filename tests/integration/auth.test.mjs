import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApplication } from '../../apps/api/dist/app.js';
import { readConfig } from '../../apps/api/dist/config.js';
import {
  api,
  callback,
  cookiesFrom,
  createHousehold,
  databaseUrl,
  identity,
  invite,
  pool,
  server,
  signIn,
  startLogin,
  stub,
} from './harness.mjs';

// AUTH-001 boundary tests, using the provider stub in harness.mjs.

test('configuration rejects secret keys and partial sign-in settings', () => {
  const base = { DATABASE_URL: databaseUrl, APP_ORIGIN: 'http://127.0.0.1:5173' };
  assert.throws(
    () =>
      readConfig({
        ...base,
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc',
      }),
    /publishable key/,
  );
  assert.throws(() => readConfig({ ...base, SUPABASE_URL: 'https://x.supabase.co' }), /together/);
  assert.throws(() => readConfig({ ...base, APP_ORIGIN: 'http://menu.example.com' }), /https/);
  assert.equal(readConfig({ DATABASE_URL: databaseUrl }).auth, undefined);
});

test('sign-in is unavailable (503) rather than bypassed when the provider is not configured', async () => {
  const { app: unconfigured } = await createApplication(
    readConfig({ DATABASE_URL: databaseUrl }),
    true,
  );
  try {
    await unconfigured.listen(0, '127.0.0.1');
    const url = await unconfigured.getUrl();
    assert.equal((await fetch(`${url}/api/auth/login`, { redirect: 'manual' })).status, 503);
    const session = await (await fetch(`${url}/api/auth/session`)).json();
    assert.deepEqual(session, { authenticated: false, signInAvailable: false });
    assert.equal((await fetch(`${url}/api/households`)).status, 401);
  } finally {
    await unconfigured.close();
  }
});

test('Google sign-in creates a profile and an HttpOnly session without exposing provider tokens', async () => {
  const person = identity('王小明 Wang');
  stub.nextIdentity = person;
  const login = await fetch(`${server.origin}/api/auth/login?returnTo=/join`, {
    redirect: 'manual',
  });
  const stateCookie = login.headers
    .getSetCookie()
    .find((line) => line.startsWith('fm_oauth_state='));
  assert.match(stateCookie, /HttpOnly/);
  assert.match(stateCookie, /SameSite=Lax/);
  const authorizeUrl = new URL(login.headers.get('location'));
  assert.equal(authorizeUrl.origin, server.providerOrigin);
  assert.equal(authorizeUrl.searchParams.get('redirect_to'), `${server.origin}/api/auth/callback`);
  const authorize = await fetch(authorizeUrl, { redirect: 'manual' });
  const response = await callback(
    authorize.headers.get('location'),
    `fm_oauth_state=${cookiesFrom(login).fm_oauth_state}`,
  );
  assert.equal(response.headers.get('location'), '/join');
  const sessionCookie = response.headers
    .getSetCookie()
    .find((line) => line.startsWith('fm_session='));
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.ok(!response.headers.getSetCookie().join('\n').includes('provider-'));

  const cookie = `fm_session=${cookiesFrom(response).fm_session}`;
  const body = await (
    await fetch(`${server.origin}/api/auth/session`, { headers: { Cookie: cookie } })
  ).text();
  assert.ok(!body.includes('provider-'));
  const session = JSON.parse(body);
  assert.equal(session.user.id, person.id);
  assert.equal(session.user.displayName, '王小明 Wang');
  assert.deepEqual(session.households, []);
  const stored = await pool.query('select token_hash from app.sessions where user_id=$1', [
    person.id,
  ]);
  assert.equal(stored.rows.length, 1);
  assert.notEqual(
    stored.rows[0].token_hash.toString('base64url'),
    cookiesFrom(response).fm_session,
  );
});

test('login state is browser-bound, single-use and expiring; provider failures create no session', async () => {
  stub.nextIdentity = identity();
  let attempt = await startLogin();
  let response = await callback(attempt.callbackUrl); // no state cookie
  assert.equal(response.headers.get('location'), '/?authError=state_invalid');
  assert.equal(cookiesFrom(response).fm_session, undefined);

  attempt = await startLogin();
  response = await callback(attempt.callbackUrl, `fm_oauth_state=${attempt.state}`);
  assert.ok(cookiesFrom(response).fm_session);
  response = await callback(attempt.callbackUrl, `fm_oauth_state=${attempt.state}`); // replay
  assert.equal(response.headers.get('location'), '/?authError=state_invalid');

  attempt = await startLogin();
  await pool.query("update app.oauth_states set expires_at = now() - interval '1 second'");
  response = await callback(attempt.callbackUrl, `fm_oauth_state=${attempt.state}`);
  assert.equal(response.headers.get('location'), '/?authError=state_invalid');

  // A code issued for another browser's PKCE challenge cannot be redeemed with this state.
  const victim = await startLogin();
  const attacker = await startLogin();
  response = await callback(attacker.callbackUrl, `fm_oauth_state=${victim.state}`);
  assert.equal(response.headers.get('location'), '/?authError=exchange_failed');
  assert.equal(cookiesFrom(response).fm_session, undefined);

  attempt = await startLogin();
  const denied = new URL(`${server.origin}/api/auth/callback`);
  denied.searchParams.set('error', 'access_denied');
  response = await callback(denied.href, `fm_oauth_state=${attempt.state}`);
  assert.equal(response.headers.get('location'), '/?authError=provider_denied');

  attempt = await startLogin();
  stub.tokenStatusOverride = 500;
  try {
    response = await callback(attempt.callbackUrl, `fm_oauth_state=${attempt.state}`);
  } finally {
    stub.tokenStatusOverride = undefined;
  }
  assert.equal(response.headers.get('location'), '/?authError=exchange_failed');
  assert.equal(cookiesFrom(response).fm_session, undefined);
});

test('post-login redirects stay on this site', async () => {
  for (const target of [
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ]) {
    stub.nextIdentity = identity();
    const attempt = await startLogin(target);
    const response = await callback(attempt.callbackUrl, `fm_oauth_state=${attempt.state}`);
    assert.equal(response.headers.get('location'), '/', target);
  }
});

test('expired, idle, revoked and rotated sessions are rejected', async () => {
  assert.equal((await api(null, '/households')).status, 401);
  assert.equal(
    (await fetch(`${server.origin}/api/households`, { headers: { Cookie: 'fm_session=forged' } }))
      .status,
    401,
  );

  const expired = await signIn();
  await pool.query(
    "update app.sessions set expires_at = now() - interval '1 second' where user_id=$1",
    [expired.id],
  );
  assert.equal((await api(expired, '/households')).status, 401);
  assert.equal((await (await api(expired, '/auth/session')).json()).authenticated, false);

  const idle = await signIn();
  await pool.query(
    "update app.sessions set last_seen_at = now() - interval '15 days' where user_id=$1",
    [idle.id],
  );
  assert.equal((await api(idle, '/households')).status, 401);

  const loggedOut = await signIn();
  assert.equal((await api(loggedOut, '/auth/logout', { method: 'POST', csrf: false })).status, 403);
  const logout = await api(loggedOut, '/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.getSetCookie()[0], /fm_session=;.*Max-Age=0/);
  assert.equal((await api(loggedOut, '/households')).status, 401);

  const person = identity();
  const first = await signIn(person);
  stub.nextIdentity = person;
  const attempt = await startLogin();
  const response = await callback(
    attempt.callbackUrl,
    `fm_oauth_state=${attempt.state}; ${first.cookie}`,
  );
  assert.ok(cookiesFrom(response).fm_session);
  assert.equal(
    (await api(first, '/households')).status,
    401,
    'previous session revoked on sign-in',
  );
});

test('state-changing requests require the session CSRF token and same origin', async () => {
  const user = await signIn();
  const body = { name: 'CSRF test' };
  assert.equal((await api(user, '/households', { method: 'POST', body, csrf: false })).status, 403);
  assert.equal(
    (
      await api(user, '/households', {
        method: 'POST',
        body,
        csrf: false,
        headers: { 'X-CSRF-Token': 'wrong' },
      })
    ).status,
    403,
  );
  const other = await signIn();
  assert.equal(
    (
      await api(user, '/households', {
        method: 'POST',
        body,
        csrf: false,
        headers: { 'X-CSRF-Token': other.csrf },
      })
    ).status,
    403,
    'another session token is not accepted',
  );
  assert.equal(
    (
      await api(user, '/households', {
        method: 'POST',
        body,
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await api(user, '/households', { method: 'POST', body, headers: { Origin: server.origin } }))
      .status,
    201,
  );
  const count = await pool.query(
    'select count(*)::int as count from app.household_members where user_id=$1',
    [user.id],
  );
  assert.equal(count.rows[0].count, 1, 'rejected requests created nothing');
});

test('household input is validated', async () => {
  const user = await signIn();
  for (const body of [
    {},
    { name: '   ' },
    { name: 'x'.repeat(101) },
    { name: 'ok', timezone: 'Mars/Base' },
  ]) {
    assert.equal((await api(user, '/households', { method: 'POST', body })).status, 400);
  }
  const created = await createHousehold(user, '  我们的家  ');
  assert.equal(created.name, '我们的家');
  assert.equal(created.timezone, 'America/Toronto');
  assert.equal(created.role, 'owner');
});

test('AC-02: a member of household A cannot read or change household B, even with valid B identifiers', async () => {
  const alice = await signIn(identity('Alice'));
  const bob = await signIn(identity('Bob'));
  const householdA = await createHousehold(alice, 'A');
  const householdB = await createHousehold(bob, 'B');
  const invitationB = await invite(bob, householdB.id);

  const attempts = [
    ['GET', `/households/${householdB.id}`],
    ['GET', `/households/${householdB.id}/invitations`],
    ['POST', `/households/${householdB.id}/invitations`],
    ['DELETE', `/households/${householdB.id}/invitations/${invitationB.id}`],
    ['DELETE', `/households/${householdB.id}/members/${bob.id}`],
    ['DELETE', `/households/${householdA.id}/invitations/${invitationB.id}`],
    ['GET', `/households/${randomUUID()}`],
    ['GET', '/households/not-a-uuid'],
  ];
  for (const [method, path] of attempts) {
    const response = await api(alice, path, { method });
    assert.equal(response.status, 404, `${method} ${path}`);
    assert.ok(!(await response.text()).includes('"B"'));
  }
  const listed = await (await api(alice, '/households')).json();
  assert.deepEqual(
    listed.map((household) => household.id),
    [householdA.id],
  );
  const stillActive = await (await api(bob, `/households/${householdB.id}/invitations`)).json();
  assert.deepEqual(
    stillActive.map((row) => row.id),
    [invitationB.id],
  );
  const members = await (await api(bob, `/households/${householdB.id}`)).json();
  assert.deepEqual(
    members.members.map((member) => member.userId),
    [bob.id],
  );
});

test('AC-01: owners invite with single-use links; expired, revoked, used and unknown links fail', async () => {
  const owner = await signIn(identity('Owner'));
  const household = await createHousehold(owner, 'Invite home');
  const joiner = await signIn(identity('Joiner'));

  const link = await invite(owner, household.id);
  assert.equal(link.url, `${server.origin}/join#${link.token}`);
  const publicPreview = await fetch(link.url, { headers: { Accept: 'text/html' } });
  assert.equal(publicPreview.status, 200);
  const previewHtml = await publicPreview.text();
  assert.match(previewHtml, /<meta property="og:title" content="You’re invited to Family Menu"/);
  assert.ok(
    previewHtml.includes(`<meta property="og:image" content="${server.origin}/invite-preview.png"`),
  );
  assert.ok(!previewHtml.includes(household.name));
  assert.ok(!previewHtml.includes(link.token));
  const image = await fetch(`${server.origin}/invite-preview.png`);
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  const stored = await pool.query('select token_hash from app.household_invitations where id=$1', [
    link.id,
  ]);
  assert.ok(
    !stored.rows[0].token_hash.toString('utf8').includes(link.token),
    'only a hash is stored',
  );

  const preview = await api(joiner, '/invitations/preview', {
    method: 'POST',
    body: { token: link.token },
  });
  assert.equal(preview.status, 200);
  assert.deepEqual(
    { ...(await preview.json()), expiresAt: undefined },
    { householdName: 'Invite home', alreadyMember: false, expiresAt: undefined },
  );
  assert.equal(
    (
      await api(joiner, '/invitations/accept', {
        method: 'POST',
        body: { token: link.token },
        csrf: false,
      })
    ).status,
    403,
  );
  const accepted = await api(joiner, '/invitations/accept', {
    method: 'POST',
    body: { token: link.token },
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).role, 'member');
  const again = await api(joiner, '/invitations/accept', {
    method: 'POST',
    body: { token: link.token },
  });
  assert.equal(again.status, 200, 'accepting twice is idempotent for the same member');
  assert.equal((await api(joiner, `/households/${household.id}`)).status, 200);

  const third = await signIn(identity('Third'));
  assert.equal(
    (await api(third, '/invitations/accept', { method: 'POST', body: { token: link.token } }))
      .status,
    410,
  );

  const revoked = await invite(owner, household.id);
  assert.equal(
    (
      await api(owner, `/households/${household.id}/invitations/${revoked.id}`, {
        method: 'DELETE',
      })
    ).status,
    204,
  );
  assert.equal(
    (await api(third, '/invitations/preview', { method: 'POST', body: { token: revoked.token } }))
      .status,
    410,
  );
  assert.equal(
    (await api(third, '/invitations/accept', { method: 'POST', body: { token: revoked.token } }))
      .status,
    410,
  );

  const expired = await invite(owner, household.id);
  await pool.query(
    "update app.household_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id=$1",
    [expired.id],
  );
  assert.equal(
    (await api(third, '/invitations/accept', { method: 'POST', body: { token: expired.token } }))
      .status,
    410,
  );

  for (const token of ['x'.repeat(43), 'short', '../../etc', 123]) {
    assert.equal(
      (await api(third, '/invitations/accept', { method: 'POST', body: { token } })).status,
      404,
    );
  }
  assert.equal((await api(third, `/households/${household.id}`)).status, 404, 'third never joined');

  assert.equal(
    (await api(joiner, `/households/${household.id}/invitations`, { method: 'POST' })).status,
    403,
  );
  assert.equal((await api(joiner, `/households/${household.id}/invitations`)).status, 403);
  const active = await (await api(owner, `/households/${household.id}/invitations`)).json();
  assert.deepEqual(active, [], 'used, revoked and expired links are not listed as active');
});

test('concurrent acceptance of one link admits exactly one person', async () => {
  const owner = await signIn();
  const household = await createHousehold(owner);
  const link = await invite(owner, household.id);
  // Sign in sequentially: the provider stub hands out one pending identity at a time.
  const racers = [await signIn(), await signIn(), await signIn()];
  assert.equal(new Set(racers.map((user) => user.id)).size, 3);
  const statuses = await Promise.all(
    racers.map((user) =>
      api(user, '/invitations/accept', { method: 'POST', body: { token: link.token } }).then(
        (r) => r.status,
      ),
    ),
  );
  assert.deepEqual(statuses.sort(), [200, 410, 410]);
  const count = await pool.query(
    "select count(*)::int as count from app.household_members where household_id=$1 and role='member'",
    [household.id],
  );
  assert.equal(count.rows[0].count, 1);
});

test('AC-03 foundation: removed members lose access immediately and cannot reuse their link', async () => {
  const owner = await signIn(identity('Owner'));
  const household = await createHousehold(owner);
  const member = await signIn(identity('Member'));
  const other = await signIn(identity('Other'));
  const link = await invite(owner, household.id);
  await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } });
  const otherLink = await invite(owner, household.id);
  await api(other, '/invitations/accept', { method: 'POST', body: { token: otherLink.token } });

  assert.equal(
    (await api(member, `/households/${household.id}/members/${other.id}`, { method: 'DELETE' }))
      .status,
    403,
  );
  assert.equal(
    (await api(member, `/households/${household.id}/members/${owner.id}`, { method: 'DELETE' }))
      .status,
    403,
  );
  assert.equal(
    (await api(owner, `/households/${household.id}/members/${owner.id}`, { method: 'DELETE' }))
      .status,
    409,
  );

  assert.equal(
    (await api(owner, `/households/${household.id}/members/${member.id}`, { method: 'DELETE' }))
      .status,
    204,
  );
  assert.equal((await api(member, `/households/${household.id}`)).status, 404);
  assert.deepEqual(await (await api(member, '/households')).json(), []);
  assert.equal(
    (await api(member, '/invitations/accept', { method: 'POST', body: { token: link.token } }))
      .status,
    410,
  );
  assert.equal(
    (await api(owner, `/households/${household.id}/members/${member.id}`, { method: 'DELETE' }))
      .status,
    404,
  );

  assert.equal(
    (await api(other, `/households/${household.id}/members/${other.id}`, { method: 'DELETE' }))
      .status,
    204,
    'members can leave',
  );
  assert.equal((await api(other, `/households/${household.id}`)).status, 404);
  const detail = await (await api(owner, `/households/${household.id}`)).json();
  assert.deepEqual(
    detail.members.map((row) => row.userId),
    [owner.id],
  );
});
