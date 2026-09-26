import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

/** 256-bit random token encoded for URLs and cookies. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export interface CookieNames {
  session: string;
  oauthState: string;
  secure: boolean;
}

/** `__Host-` cookies require Secure, so plain-http loopback development uses unprefixed names. */
export function cookieNames(appOrigin: string | undefined): CookieNames {
  const secure = appOrigin?.startsWith('https://') ?? false;
  return secure
    ? { session: '__Host-fm_session', oauthState: '__Host-fm_oauth_state', secure }
    : { session: 'fm_session', oauthState: 'fm_oauth_state', secure };
}

export function setCookie(
  response: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  response.append(
    'Set-Cookie',
    [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
      ...(secure ? ['Secure'] : []),
    ].join('; '),
  );
}

export function clearCookie(response: Response, name: string, secure: boolean) {
  setCookie(response, name, '', 0, secure);
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  if ([...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f))
    return '/';
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
