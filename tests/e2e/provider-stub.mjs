// Test-only stand-in for the Supabase Auth HTTP endpoints used by the PKCE flow.
// It is started only by playwright.config.ts and is never part of the application build.
// "Choosing" an account here mirrors the Google account chooser; the app code under test
// still performs the real state, PKCE and session handling.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.STUB_PORT ?? 4174);
const key = process.env.STUB_PUBLISHABLE_KEY ?? 'sb_publishable_e2e_stub';
const codes = new Map();

function idFor(name) {
  const hex = createHash('sha256').update(`e2e:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const escape = (value) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') return response.end('ok');
  if (request.method === 'GET' && url.pathname === '/auth/v1/authorize') {
    const name = url.searchParams.get('test_account');
    if (!name) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const hidden = [...url.searchParams]
        .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
        .join('');
      return response.end(
        `<!doctype html><title>Test account chooser</title><form>${hidden}` +
          `<label>Test account name <input name="test_account" required></label>` +
          `<button>Continue</button></form>`,
      );
    }
    const code = crypto.randomUUID();
    codes.set(code, { challenge: url.searchParams.get('code_challenge'), name });
    const redirect = new URL(url.searchParams.get('redirect_to'));
    redirect.searchParams.set('code', code);
    response.writeHead(302, { Location: redirect.href });
    return response.end();
  }
  if (request.method === 'POST' && url.pathname === '/auth/v1/token') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const issued = codes.get(body.auth_code);
    codes.delete(body.auth_code);
    const valid =
      issued &&
      request.headers.apikey === key &&
      createHash('sha256').update(String(body.code_verifier)).digest('base64url') ===
        issued.challenge;
    response.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json' });
    return response.end(
      JSON.stringify(
        valid
          ? {
              access_token: 'stub',
              user: {
                id: idFor(issued.name),
                email: `${issued.name.toLowerCase().replace(/\W+/g, '.')}@example.test`,
                user_metadata: { full_name: issued.name },
              },
            }
          : { error: 'invalid_grant' },
      ),
    );
  }
  response.writeHead(404).end();
}).listen(port, '127.0.0.1');
