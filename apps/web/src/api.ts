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
    /** Parsed JSON error body, e.g. { code: 'ambiguous_time', options: [...] }. */
    readonly body: Record<string, unknown> | null = null,
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
  return readResponse<T>(response);
}

async function readResponse<T>(response: Response) {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const message = typeof body?.message === 'string' ? body.message : 'Something went wrong.';
    throw new ApiError(response.status, message, body);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Uploads raw image bytes; the server validates and re-encodes them. */
export async function uploadImage<T>(path: string, image: Blob) {
  const response = await fetch(`/api${path}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken, 'Content-Type': image.type },
    body: image,
  });
  return readResponse<T>(response);
}

export function recipeImageUrl(householdId: string, recipeId: string, imageId: string) {
  return `/api/households/${householdId}/recipes/${recipeId}/image/${imageId}`;
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
  imageId: string | null;
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
  imageId: string | null;
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

export type OrderStatus = 'pending' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  recipeId: string;
  recipeName: string;
  servings: number;
  /** Base yield of the recipe snapshot. */
  recipeServings: number;
  pricePoints: number;
}

export interface OrderItemDetail extends OrderItem {
  steps: string[];
  ingredients: (Ingredient & { key: string })[];
  recipeRevision: number;
  snapshotAt: string;
}

export interface MealOrder<Item extends OrderItem = OrderItem> {
  id: string;
  status: OrderStatus;
  scheduledAt: string;
  /** Household-local meal date (YYYY-MM-DD) and time (HH:MM). */
  mealDate: string;
  mealTime: string;
  timezone: string;
  utcOffset: string;
  notes: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  createdBy: string;
  updatedBy: string;
  closedBy: string | null;
  totalPoints: number;
  items: Item[];
}

export type MealOrderDetail = MealOrder<OrderItemDetail>;

/** Today's date (YYYY-MM-DD) in a time zone. */
export function localToday(timeZone: string, offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

/** "Today", "Tomorrow" or e.g. "Sat, Oct 3" for a household-local date. */
export function dayLabel(date: string, timeZone: string) {
  if (date === localToday(timeZone)) return 'Today';
  if (date === localToday(timeZone, 1)) return 'Tomorrow';
  if (date === localToday(timeZone, -1)) return 'Yesterday';
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.slice(0, 4) === localToday(timeZone).slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(new Date(`${date}T12:00:00Z`));
}
