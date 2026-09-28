export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AuthProviderConfig {
  /** Supabase project URL, e.g. https://abcd.supabase.co */
  supabaseUrl: string;
  /** Supabase publishable (or legacy anon) key. Never a secret/service-role key. */
  supabasePublishableKey: string;
}

export type AiProviderName = 'anthropic' | 'deepseek' | 'gemini' | 'mock';

export const DEFAULT_AI_MODELS: Record<AiProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  deepseek: 'deepseek-flash',
  gemini: 'gemini-3.1-flash-lite',
  mock: 'mock-recipe-1',
};

export interface AiConfig {
  provider: AiProviderName;
  model: string;
  /** Anthropic may omit it: the SDK then resolves ANTHROPIC_API_KEY or an `ant auth login` profile. */
  apiKey?: string;
  /** Provider API origin override, used by adapter tests against local stubs. */
  baseUrl?: string;
  /** USD per million tokens when the model is not in the built-in price table. */
  price?: { input: number; output: number };
  /** Global provider-spend cap per UTC calendar month, in micro-USD. */
  monthlyBudgetMicros: number;
  /** Successful or in-progress drafts per household in any 24 hours. */
  householdDailyLimit: number;
  /** Draft attempts (including failures) per person in any 24 hours; an abuse limit. */
  userDailyAttempts: number;
  timeoutMs: number;
  /** Provider calls running at once in this process. */
  concurrency: number;
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
  /** Public origin the browser uses, e.g. http://127.0.0.1:5173 or https://menu.example.com */
  appOrigin?: string;
  /** Absent when sign-in is not configured; auth routes then answer 503. */
  auth?: AuthProviderConfig;
  /** Absent when AI drafts are switched off (AI_PROVIDER unset or "off"). */
  ai?: AiConfig;
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
  return { databaseUrl: url.href, port, host, appOrigin, auth, ai: readAiConfig(env, appOrigin) };
}

function readAiConfig(env: NodeJS.ProcessEnv, appOrigin: string | undefined): AiConfig | undefined {
  const provider = (env.AI_PROVIDER?.trim() || 'off').toLowerCase();
  if (provider === 'off') return undefined;
  if (!(provider in DEFAULT_AI_MODELS)) {
    throw new Error('AI_PROVIDER must be off, anthropic, deepseek, gemini or mock.');
  }
  const name = provider as AiProviderName;
  if (name === 'mock' && appOrigin?.startsWith('https://')) {
    throw new Error('AI_PROVIDER=mock is for local development and tests only.');
  }
  const keyVariable = {
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    gemini: 'GEMINI_API_KEY',
    mock: '',
  }[name];
  const apiKey = keyVariable ? env[keyVariable]?.trim() || undefined : undefined;
  if (!apiKey && (name === 'deepseek' || name === 'gemini')) {
    throw new Error(`${keyVariable} is required when AI_PROVIDER=${name}.`);
  }
  const inputPrice = env.AI_PRICE_INPUT_USD_PER_MTOK?.trim();
  const outputPrice = env.AI_PRICE_OUTPUT_USD_PER_MTOK?.trim();
  let price: AiConfig['price'];
  if (inputPrice || outputPrice) {
    price = {
      input: positiveNumber(inputPrice, 'AI_PRICE_INPUT_USD_PER_MTOK'),
      output: positiveNumber(outputPrice, 'AI_PRICE_OUTPUT_USD_PER_MTOK'),
    };
  }
  return {
    provider: name,
    model: env.AI_MODEL?.trim() || DEFAULT_AI_MODELS[name],
    apiKey,
    baseUrl: parseOrigin(env.AI_BASE_URL, 'AI_BASE_URL'),
    price,
    // USD 8.50 ≈ CAD 12 (docs/BUDGET.md) at about 1.39 CAD per USD, rounded down.
    monthlyBudgetMicros: Math.round(
      positiveNumber(env.AI_MONTHLY_BUDGET_USD?.trim() || '8.50', 'AI_MONTHLY_BUDGET_USD') * 1e6,
    ),
    householdDailyLimit: wholeNumber(env.AI_HOUSEHOLD_DAILY_LIMIT, 'AI_HOUSEHOLD_DAILY_LIMIT', 5),
    userDailyAttempts: wholeNumber(env.AI_USER_DAILY_ATTEMPTS, 'AI_USER_DAILY_ATTEMPTS', 10),
    timeoutMs: wholeNumber(env.AI_TIMEOUT_SECONDS, 'AI_TIMEOUT_SECONDS', 30) * 1000,
    concurrency: 2,
  };
}

function positiveNumber(value: string | undefined, name: string) {
  const parsed = Number(value);
  if (!value || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function wholeNumber(value: string | undefined, name: string, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error(`${name} must be a whole number from 1 to 1000.`);
  }
  return parsed;
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
