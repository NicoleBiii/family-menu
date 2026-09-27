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

export const UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'clove',
  'slice',
  'can',
  'bunch',
  'pinch',
] as const;

export interface Ingredient {
  name: string;
  /** Exact decimal string, or null for "to taste" / unknown amounts. */
  quantity: string | null;
  unit: (typeof UNITS)[number] | null;
  form: string | null;
  note: string | null;
}

export interface RecipeContent {
  name: string;
  description: string;
  servings: number;
  steps: string[];
  ingredients: Ingredient[];
}

export interface RecipePreset extends RecipeContent {
  id: string;
  version: number;
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  servings: number;
  pricePoints: number;
  source: 'manual' | 'preset';
  presetId: string | null;
  revision: number;
  updatedAt: string;
  archived: boolean;
  ingredientCount: number;
}

export interface RecipeDetail extends RecipeContent {
  id: string;
  pricePoints: number;
  source: 'manual' | 'preset';
  presetId: string | null;
  presetVersion: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  archived: boolean;
}

const PLURAL_UNITS: Partial<Record<(typeof UNITS)[number], string>> = {
  cup: 'cups',
  piece: 'pieces',
  clove: 'cloves',
  slice: 'slices',
  can: 'cans',
  bunch: 'bunches',
  pinch: 'pinches',
};

export function formatIngredient(line: Ingredient) {
  const unit =
    line.unit && line.quantity && Number(line.quantity) > 1
      ? (PLURAL_UNITS[line.unit] ?? line.unit)
      : line.unit;
  const amount = [line.quantity, unit].filter(Boolean).join(' ');
  return [
    amount ? `${amount} ${line.name}` : line.name,
    line.form ? `, ${line.form}` : '',
    line.note ? ` (${line.note})` : '',
  ].join('');
}
