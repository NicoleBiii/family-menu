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

/** Fired when an API call finds the session has ended; the app then shows sign-in again. */
export const SESSION_EXPIRED_EVENT = 'family-menu:session-expired';

/** fetch that turns a network failure into a readable ApiError (status 0). */
async function send(input: string, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(0, 'Family Menu could not be reached. Check your connection and try again.');
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? 'GET';
  const response = await send(`/api${path}`, {
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
    let message = typeof body?.message === 'string' ? body.message : 'Something went wrong.';
    if (response.status >= 500) {
      message = 'Something went wrong on our side. Please try again in a moment.';
    }
    if (response.status === 401 && !response.url.endsWith('/api/auth/session')) {
      message = 'Your session has ended. Please sign in again.';
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, message, body);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Uploads raw image bytes; the server validates and re-encodes them. */
export async function uploadImage<T>(path: string, image: Blob) {
  const response = await send(`/api${path}`, {
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

export type RecipeSource = 'manual' | 'preset' | 'ai';

export interface AiDraft {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  dishName: string;
  preferences: string;
  model: string;
  errorCode: string | null;
  errorMessage: string | null;
  /** The model's draft after server validation; null until it succeeds. */
  draft: (RecipeContent & { suggestedCategory: string | null }) | null;
  savedRecipeId: string | null;
  discarded: boolean;
  createdAt: string;
  finishedAt: string | null;
  createdBy: string;
}

export interface AiOverview {
  enabled: boolean;
  model: string | null;
  householdDailyLimit: number;
  remainingToday: number;
  drafts: AiDraft[];
}

export const PRESET_CATEGORIES = [
  'breakfast',
  'mains',
  'noodlesRice',
  'soups',
  'vegetables',
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export interface RecipePreset extends RecipeContent {
  id: string;
  version: number;
  /** Suggested category key; the interface names it and never creates it silently. */
  category: PresetCategory;
}

/** A household recipe category (ADR 0007). Counts cover active and archived recipes. */
export interface Category {
  id: string;
  name: string;
  recipeCount: number;
  archivedCount: number;
}

/** Same normalization as the server: case, width and spacing do not make a new name. */
export function categoryKey(name: string) {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  servings: number;
  pricePoints: number;
  source: RecipeSource;
  presetId: string | null;
  categoryId: string | null;
  revision: number;
  updatedAt: string;
  archived: boolean;
  ingredientCount: number;
  imageId: string | null;
}

export interface RecipeDetail extends RecipeContent {
  id: string;
  pricePoints: number;
  source: RecipeSource;
  presetId: string | null;
  presetVersion: number | null;
  categoryId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  archived: boolean;
  imageId: string | null;
}

export const PLURAL_UNITS: Partial<Record<(typeof UNITS)[number], string>> = {
  cup: 'cups',
  piece: 'pieces',
  clove: 'cloves',
  slice: 'slices',
  can: 'cans',
  bunch: 'bunches',
  pinch: 'pinches',
};

const ZH_UNITS: Record<(typeof UNITS)[number], string> = {
  g: '克',
  kg: '千克',
  oz: '盎司',
  lb: '磅',
  ml: '毫升',
  l: '升',
  tsp: '茶匙',
  tbsp: '汤匙',
  cup: '杯',
  piece: '个',
  clove: '瓣',
  slice: '片',
  can: '罐',
  bunch: '把',
  pinch: '撮',
};

export function unitLabel(unit: (typeof UNITS)[number], language: 'en' | 'zh' = 'en') {
  return language === 'zh' ? ZH_UNITS[unit] : unit;
}

export function formatIngredient(line: Ingredient, language: 'en' | 'zh' = 'en') {
  const unit =
    language === 'zh' && line.unit
      ? ZH_UNITS[line.unit]
      : line.unit && line.quantity && Number(line.quantity) > 1
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
export function dayLabel(date: string, timeZone: string, language: 'en' | 'zh' = 'en') {
  if (date === localToday(timeZone)) return language === 'zh' ? '今天' : 'Today';
  if (date === localToday(timeZone, 1)) return language === 'zh' ? '明天' : 'Tomorrow';
  if (date === localToday(timeZone, -1)) return language === 'zh' ? '昨天' : 'Yesterday';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.slice(0, 4) === localToday(timeZone).slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(new Date(`${date}T12:00:00Z`));
}

export interface ShoppingAmount {
  quantity: string;
  /** null means whole items (no unit). */
  unit: string | null;
  /** True when the exact value needed rounding; it was rounded up. */
  approximate: boolean;
}

export interface ShoppingEntry {
  key: string;
  name: string;
  form: string | null;
  amounts: ShoppingAmount[];
  /** Notes of lines without an amount, e.g. "to taste" (null when no note). */
  unquantified: (string | null)[];
  dishes: string[];
  lineCount: number;
}

/** One checkable line: an ingredient, form and unit family (ADR 0009). */
export interface ChecklistLine {
  lineId: string;
  key: string;
  name: string;
  form: string | null;
  family: string;
  unquantified: boolean;
  notes: string[];
  dishes: string[];
  state: 'open' | 'bought';
  toBuy: ShoppingAmount | null;
  bought: ShoppingAmount | null;
  partlyBought: boolean;
  /** What the member saw; a check with an outdated token is refused. */
  token: string;
  /** Active purchases covering this line's pending demand, newest first. */
  purchases: { id: string; by: string; at: string }[];
}

export interface Purchase {
  id: string;
  name: string;
  form: string | null;
  family: string;
  unquantified: boolean;
  amount: ShoppingAmount | null;
  purchasedAt: string;
  purchasedBy: string;
  undoneAt: string | null;
  undoneBy: string | null;
}

export interface ShoppingList {
  scope: { from: string | null; to: string | null };
  generatedAt: string;
  orderCount: number;
  combined: ShoppingEntry[];
  checklist: ChecklistLine[];
  grouped: {
    mealDate: string;
    orders: {
      orderId: string;
      mealTime: string;
      items: {
        itemId: string;
        recipeName: string;
        servings: number;
        recipeServings: number;
        ingredients: (Ingredient & { approximate: boolean })[];
      }[];
    }[];
  }[];
}

export function formatAmount(amount: ShoppingAmount, language: 'en' | 'zh' = 'en') {
  const unit =
    amount.unit === null
      ? language === 'zh'
        ? '个'
        : 'whole'
      : language === 'zh'
        ? (ZH_UNITS[amount.unit as (typeof UNITS)[number]] ?? amount.unit)
        : Number(amount.quantity) > 1
          ? (PLURAL_UNITS[amount.unit as (typeof UNITS)[number]] ?? amount.unit)
          : amount.unit;
  return `${amount.approximate ? '≈ ' : ''}${amount.quantity} ${unit}`;
}
