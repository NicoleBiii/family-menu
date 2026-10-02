import { useCallback, useEffect, useState } from 'react';
import type { RecipeSummary } from './api';

/** The server accepts at most 20 dishes per order. */
export const MAX_BASKET_ITEMS = 20;
const MAX_SERVINGS = 100;
const KEY_PREFIX = 'family-menu:basket:';

export interface BasketItem {
  recipeId: string;
  servings: number;
}

/**
 * An unsent order (UX-002 proposal §2). It lives only in this browser tab's session storage,
 * separately for each household; no server order exists until the member places it. The
 * request id stays the same until the order is placed, so a retried submission (double tap,
 * network failure) returns the first order instead of creating a second one.
 */
export interface Basket {
  items: BasketItem[];
  notes: string;
  timing: 'now' | 'scheduled';
  date: string;
  time: string;
  requestId: string;
}

function empty(): Basket {
  return {
    items: [],
    notes: '',
    timing: 'now',
    date: '',
    time: '18:00',
    requestId: crypto.randomUUID(),
  };
}

const clampServings = (value: number) =>
  Math.min(MAX_SERVINGS, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)));

/** Reads a stored basket; anything malformed (or unavailable storage) yields an empty one. */
function read(householdId: string | undefined): Basket {
  if (!householdId) return empty();
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY_PREFIX + householdId) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object') return empty();
    const stored = raw as Partial<Basket>;
    const items = Array.isArray(stored.items)
      ? stored.items
          .filter(
            (item): item is BasketItem =>
              typeof item?.recipeId === 'string' && typeof item.servings === 'number',
          )
          .slice(0, MAX_BASKET_ITEMS)
          .map((item) => ({ recipeId: item.recipeId, servings: clampServings(item.servings) }))
      : [];
    return {
      items,
      notes: typeof stored.notes === 'string' ? stored.notes.slice(0, 1000) : '',
      timing: stored.timing === 'scheduled' ? 'scheduled' : 'now',
      date: typeof stored.date === 'string' ? stored.date : '',
      time: typeof stored.time === 'string' ? stored.time : '18:00',
      requestId: typeof stored.requestId === 'string' ? stored.requestId : crypto.randomUUID(),
    };
  } catch {
    return empty();
  }
}

function write(householdId: string | undefined, basket: Basket) {
  if (!householdId) return;
  try {
    if (basket.items.length === 0 && !basket.notes) {
      sessionStorage.removeItem(KEY_PREFIX + householdId);
    } else sessionStorage.setItem(KEY_PREFIX + householdId, JSON.stringify(basket));
  } catch {
    // The basket still works for this page view without storage.
  }
}

/** Removes every stored basket, e.g. on sign-out so the next person on this device starts empty. */
export function clearStoredBaskets() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(KEY_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing is stored when storage is unavailable.
  }
}

export function useBasket(householdId: string | undefined) {
  const [state, setState] = useState(() => ({ householdId, basket: read(householdId) }));
  useEffect(() => {
    setState((current) =>
      current.householdId === householdId ? current : { householdId, basket: read(householdId) },
    );
  }, [householdId]);
  const basket = state.householdId === householdId ? state.basket : read(householdId);

  const change = useCallback(
    (update: (current: Basket) => Basket) =>
      setState((current) => {
        const base = current.householdId === householdId ? current.basket : read(householdId);
        const next = update(base);
        write(householdId, next);
        return { householdId, basket: next };
      }),
    [householdId],
  );

  /** Adds a dish at its base servings; adding it again adds one more serving. */
  const add = useCallback(
    (recipe: Pick<RecipeSummary, 'id' | 'servings'>) =>
      change((current) => {
        const existing = current.items.find((item) => item.recipeId === recipe.id);
        if (existing) {
          return {
            ...current,
            items: current.items.map((item) =>
              item.recipeId === recipe.id
                ? { ...item, servings: clampServings(item.servings + 1) }
                : item,
            ),
          };
        }
        if (current.items.length >= MAX_BASKET_ITEMS) return current;
        return {
          ...current,
          items: [
            ...current.items,
            { recipeId: recipe.id, servings: clampServings(recipe.servings) },
          ],
        };
      }),
    [change],
  );

  /** Sets a dish's servings; zero or less removes it. */
  const setServings = useCallback(
    (recipeId: string, servings: number) =>
      change((current) => ({
        ...current,
        items:
          servings < 1
            ? current.items.filter((item) => item.recipeId !== recipeId)
            : current.items.map((item) =>
                item.recipeId === recipeId ? { ...item, servings: clampServings(servings) } : item,
              ),
      })),
    [change],
  );

  const update = useCallback(
    (patch: Partial<Omit<Basket, 'requestId'>>) => change((current) => ({ ...current, ...patch })),
    [change],
  );

  /** Empties the basket and starts a new request id; nothing is sent to the server. */
  const clear = useCallback(() => change(() => empty()), [change]);

  /** Drops dishes that are no longer on the menu; returns whether any were dropped. */
  const keepAvailable = useCallback(
    (recipes: Pick<RecipeSummary, 'id'>[]) => {
      const gone = basket.items.filter(
        (item) => !recipes.some((recipe) => recipe.id === item.recipeId),
      );
      if (gone.length === 0) return false;
      change((current) => ({
        ...current,
        items: current.items.filter((item) =>
          recipes.some((recipe) => recipe.id === item.recipeId),
        ),
      }));
      return true;
    },
    [basket.items, change],
  );

  return { basket, add, setServings, update, clear, keepAvailable };
}

export type BasketControls = ReturnType<typeof useBasket>;
