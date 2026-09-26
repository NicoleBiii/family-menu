export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AuthProviderConfig {
  /** Supabase project URL, e.g. https://abcd.supabase.co */
  supabaseUrl: string;
  /** Supabase publishable (or legacy anon) key. Never a secret/service-role key. */
  supabasePublishableKey: string;
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
  /** Public origin the browser uses, e.g. http://127.0.0.1:5173 or https://menu.example.com */
  appOrigin?: string;
  /** Absent when sign-in is not configured; auth routes then answer 503. */
  auth?: AuthProviderConfig;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const host = env.HOST ?? '127.0.0.1';
  const appOrigin = parseOrigin(env.APP_ORIGIN, 'APP_ORIGIN');

  let auth: AuthProviderConfig | undefined;
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (supabaseUrl || key) {
    if (!supabaseUrl || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set together.');
    }
    if (/^sb_secret_/.test(key) || /service_role/.test(decodeJwtRole(key) ?? '')) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key, not a secret key.');
    }
    if (!appOrigin) throw new Error('APP_ORIGIN is required when sign-in is configured.');
    auth = { supabaseUrl: parseOrigin(supabaseUrl, 'SUPABASE_URL')!, supabasePublishableKey: key };
  }
  return { databaseUrl: url.href, port, host, appOrigin, auth };
}

function parseOrigin(value: string | undefined, name: string): string | undefined {
  if (!value?.trim()) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL.`);
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error(`${name} must use https (http is allowed only for loopback development).`);
  }
  return parsed.origin;
}

function decodeJwtRole(key: string): string | undefined {
  const payload = key.split('.')[1];
  if (!payload) return undefined;
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string })
      .role;
  } catch {
    return undefined;
  }
}
