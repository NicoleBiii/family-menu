export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
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
  return {
    databaseUrl: url.href,
    port,
    host: env.HOST ?? '127.0.0.1',
  };
}
