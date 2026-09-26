export type Role = 'owner' | 'member';

export interface HouseholdSummary {
  id: string;
  name: string;
  timezone: string;
  role: Role;
}

export interface HouseholdDetail extends HouseholdSummary {
  members: { userId: string; displayName: string; role: Role; joinedAt: string }[];
}

export interface Invitation {
  id: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
}

export type Session =
  | { authenticated: false; signInAvailable: boolean }
  | {
      authenticated: true;
      user: { id: string; displayName: string; email: string | null };
      csrfToken: string;
      households: HouseholdSummary[];
    };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken = '';
export function setCsrfToken(token: string) {
  csrfToken = token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? 'GET';
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === 'string' ? body.message : 'Something went wrong.';
    throw new ApiError(response.status, message);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function signInUrl(returnTo: string) {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export const authErrorMessages: Record<string, string> = {
  state_invalid: 'Your sign-in attempt expired or was interrupted. Please try again.',
  provider_denied: 'Google sign-in was cancelled.',
  exchange_failed: 'We could not confirm your Google sign-in. Please try again.',
  not_configured: 'Sign-in is not configured on this server yet.',
};
