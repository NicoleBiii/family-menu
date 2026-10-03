import { createHash } from 'node:crypto';

/**
 * Deterministic shopping-list arithmetic over order snapshots. No floating point: quantities
 * are exact rationals (BigInt numerator/denominator) until display. Only fixed, exact unit
 * relations are used; nothing converts between mass, volume and counts, between metric and
 * imperial/spoon measures, or between different preparation forms.
 */

export interface Rational {
  n: bigint;
  d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

export function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error('Division by zero');
  const sign = d < 0n ? -1n : 1n;
  const divisor = gcd(n, d) || 1n;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

export function parseDecimal(value: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Not a decimal: ${value}`);
  const fraction = match[2] ?? '';
  return rational(BigInt(match[1]! + fraction), 10n ** BigInt(fraction.length));
}

export const add = (a: Rational, b: Rational) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const multiply = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
export const divide = (a: Rational, b: Rational) => rational(a.n * b.d, a.d * b.n);

/**
 * Decimal string with at most `places` fraction digits. Values that cannot be written exactly
 * are rounded UP (never buy too little) and flagged approximate.
 */
export function toDecimal(value: Rational, places = 3) {
  const scale = 10n ** BigInt(places);
  const scaled = value.n * scale;
  let whole = scaled / value.d;
  const exact = scaled % value.d === 0n;
  if (!exact) whole += 1n;
  const integer = whole / scale;
  const fraction = (whole % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return { quantity: fraction ? `${integer}.${fraction}` : `${integer}`, approximate: !exact };
}

/** Units that can be added together, with their size in the family's smallest unit. */
const FAMILIES: Record<string, { family: string; factor: bigint }> = {
  g: { family: 'mass-metric', factor: 1n },
  kg: { family: 'mass-metric', factor: 1000n },
  oz: { family: 'mass-imperial', factor: 1n },
  lb: { family: 'mass-imperial', factor: 16n },
  ml: { family: 'volume-metric', factor: 1n },
  l: { family: 'volume-metric', factor: 1000n },
  tsp: { family: 'volume-spoon', factor: 1n },
  tbsp: { family: 'volume-spoon', factor: 3n },
  cup: { family: 'volume-spoon', factor: 48n },
};

function familyOf(unit: string | null) {
  if (unit && FAMILIES[unit]) return FAMILIES[unit];
  // Count-like units (piece, clove, can…) and unit-less whole items only add to themselves.
  return { family: `count:${unit ?? ''}`, factor: 1n };
}

function unitsOf(family: string) {
  return Object.entries(FAMILIES)
    .filter(([, value]) => value.family === family)
    .sort((a, b) => Number(b[1].factor - a[1].factor));
}

/**
 * Presents a family total in the largest unit that shows it as at least 1 and exactly with at
 * most three decimals (e.g. 1500 g → 1.5 kg, 72 tsp → 1.5 cup, 50 tsp stays tsp).
 */
export function present(total: Rational, family: string) {
  if (family.startsWith('count:')) {
    return { ...toDecimal(total), unit: family.slice('count:'.length) || null };
  }
  const units = unitsOf(family);
  for (const [unit, { factor }] of units) {
    const value = divide(total, rational(factor));
    const decimal = toDecimal(value);
    if (value.n >= value.d && !decimal.approximate) return { ...decimal, unit };
  }
  const [smallest] = units.slice(-1);
  return { ...toDecimal(total), unit: smallest![0] };
}

export interface SnapshotLine {
  name: string;
  key: string;
  quantity: string | null;
  unit: string | null;
  form: string | null;
  note: string | null;
}

export interface DemandRow {
  orderId: string;
  mealDate: string;
  mealTime: string;
  scheduledAt: Date;
  itemId: string;
  recipeName: string;
  servings: number;
  recipeServings: number;
  ingredients: SnapshotLine[];
}

const normalizeForm = (form: string | null) =>
  form ? form.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim() || null : null;

/** required = snapshot quantity × ordered servings ÷ recipe base servings, exactly. */
export function scaled(line: SnapshotLine, servings: number, recipeServings: number) {
  if (line.quantity === null) return null;
  return divide(
    multiply(parseDecimal(line.quantity), rational(BigInt(servings))),
    rational(BigInt(recipeServings)),
  );
}

/**
 * Builds both shopping views from one set of rows, so they always describe the same demand.
 */
export function buildShoppingList(rows: DemandRow[]) {
  interface Entry {
    key: string;
    name: string;
    form: string | null;
    totals: Map<string, Rational>;
    unquantified: Set<string>;
    dishes: Set<string>;
    lineCount: number;
  }
  const combined = new Map<string, Entry>();
  const days = new Map<
    string,
    Map<
      string,
      {
        orderId: string;
        mealTime: string;
        scheduledAt: Date;
        items: {
          itemId: string;
          recipeName: string;
          servings: number;
          recipeServings: number;
          ingredients: {
            name: string;
            form: string | null;
            note: string | null;
            quantity: string | null;
            unit: string | null;
            approximate: boolean;
          }[];
        }[];
      }
    >
  >();

  for (const row of rows) {
    const day = days.get(row.mealDate) ?? new Map();
    days.set(row.mealDate, day);
    const order = day.get(row.orderId) ?? {
      orderId: row.orderId,
      mealTime: row.mealTime,
      scheduledAt: row.scheduledAt,
      items: [],
    };
    day.set(row.orderId, order);
    const lines = [];
    for (const line of row.ingredients) {
      const form = normalizeForm(line.form);
      const groupKey = `${line.key}\u0000${form ?? ''}`;
      const entry = combined.get(groupKey) ?? {
        key: line.key,
        name: line.name,
        form: line.form,
        totals: new Map(),
        unquantified: new Set<string>(),
        dishes: new Set<string>(),
        lineCount: 0,
      };
      combined.set(groupKey, entry);
      entry.dishes.add(row.recipeName);
      entry.lineCount += 1;
      const amount = scaled(line, row.servings, row.recipeServings);
      if (amount === null) {
        entry.unquantified.add(line.note ?? '');
        lines.push({
          name: line.name,
          form: line.form,
          note: line.note,
          quantity: null,
          unit: null,
          approximate: false,
        });
        continue;
      }
      const { family, factor } = familyOf(line.unit);
      entry.totals.set(
        family,
        add(entry.totals.get(family) ?? rational(0n), multiply(amount, rational(factor))),
      );
      const shown = toDecimal(amount);
      lines.push({
        name: line.name,
        form: line.form,
        note: line.note,
        quantity: shown.quantity,
        unit: line.unit,
        approximate: shown.approximate,
      });
    }
    order.items.push({
      itemId: row.itemId,
      recipeName: row.recipeName,
      servings: row.servings,
      recipeServings: row.recipeServings,
      ingredients: lines,
    });
  }

  const familyOrder = (family: string) =>
    ['mass-metric', 'mass-imperial', 'volume-metric', 'volume-spoon'].indexOf(family) + 1 ||
    (family === 'count:' ? 10 : 11);
  return {
    combined: [...combined.values()]
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        form: entry.form,
        amounts: [...entry.totals.entries()]
          .sort((a, b) => familyOrder(a[0]) - familyOrder(b[0]) || a[0].localeCompare(b[0]))
          .map(([family, total]) => present(total, family)),
        unquantified: [...entry.unquantified].map((note) => note || null),
        dishes: [...entry.dishes].sort(),
        lineCount: entry.lineCount,
      }))
      .sort(
        (a, b) =>
          a.key.localeCompare(b.key, 'en') || (a.form ?? '').localeCompare(b.form ?? '', 'en'),
      ),
    grouped: [...days.entries()].map(([mealDate, orders]) => ({
      mealDate,
      orders: [...orders.values()],
    })),
  };
}

/* ---------------------------------------------------------------------------------------------
 * Shared shopping checks (ADR 0009). A checkable line is one ingredient, one normalized form and
 * one unit family (or "unquantified"). Purchases are allocated to the order items they covered,
 * so remaining = Σ max(0, required − covered) per item: later demand reappears, closed orders
 * leave the demand, and a spare amount on one order never covers another.
 * ------------------------------------------------------------------------------------------- */

export const UNQUANTIFIED = 'unquantified';

export interface LineIdentity {
  key: string;
  formKey: string;
  family: string;
}

/** Opaque, URL-safe line id; the parts are validated again when it is parsed. */
export function lineIdOf(line: LineIdentity) {
  return Buffer.from(JSON.stringify([line.key, line.formKey, line.family])).toString('base64url');
}

export function parseLineId(value: unknown): LineIdentity | null {
  if (typeof value !== 'string' || value.length > 400) return null;
  try {
    const parts = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(parts) || parts.length !== 3) return null;
    const [key, formKey, family] = parts as unknown[];
    if (
      typeof key !== 'string' ||
      typeof formKey !== 'string' ||
      typeof family !== 'string' ||
      !key ||
      key.length > 100 ||
      formKey.length > 60 ||
      !family ||
      family.length > 40
    ) {
      return null;
    }
    return { key, formKey, family };
  } catch {
    return null;
  }
}

export interface AllocationRow extends LineIdentity {
  purchaseId: string;
  itemId: string;
  /** Exact amount in the family's base unit; null for unquantified lines. */
  quantity: Rational | null;
  purchasedBy: string;
  purchasedAt: Date;
  /** How many order items the whole purchase covered (a combined check may cover several). */
  purchaseItems?: number;
}

export interface PurchaseRef {
  id: string;
  by: string;
  at: Date;
  /** The purchase also covered other dishes, so undoing it reopens them too. */
  shared: boolean;
}

interface ItemShare {
  required: Rational;
  covered: Rational;
  /** Unquantified lines: whether an active purchase covered this item. */
  coveredFlag: boolean;
  purchases: Map<string, PurchaseRef>;
}

/** Digest of what a check would allocate; a different list cannot be checked by mistake. */
function tokenOf(outstanding: { itemId: string; quantity: Rational | null }[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        outstanding
          .map(({ itemId, quantity }) => [itemId, quantity ? `${quantity.n}/${quantity.d}` : '*'])
          .sort(),
      ),
    )
    .digest('base64url')
    .slice(0, 22);
}

const ZERO = rational(0n);
const isPositive = (value: Rational) => value.n > 0n;
const subtract = (a: Rational, b: Rational) => add(a, rational(-b.n, b.d));
const min = (a: Rational, b: Rational) => (subtract(a, b).n <= 0n ? a : b);

/** One dish's share of a checkable line. `remaining` stays on the server. */
export interface ItemTask {
  itemId: string;
  state: 'open' | 'bought';
  /** This dish's full demand, as in the by-day view. */
  required: ReturnType<typeof present> | null;
  toBuy: ReturnType<typeof present> | null;
  bought: ReturnType<typeof present> | null;
  partlyBought: boolean;
  token: string;
  purchases: PurchaseRef[];
  remaining: Rational | null;
}

export function amountOf(line: SnapshotLine, servings: number, recipeServings: number) {
  const value = scaled(line, servings, recipeServings);
  if (value === null) return { family: UNQUANTIFIED, base: null };
  const { family, factor } = familyOf(line.unit);
  return { family, base: multiply(value, rational(factor)) };
}

/**
 * The checklist for the given pending demand and the active (not undone) allocations to it.
 * `outstanding` lists, per order item, what a check of the line would allocate now.
 */
export function buildChecklist(rows: DemandRow[], allocations: AllocationRow[]) {
  interface Line extends LineIdentity {
    name: string;
    form: string | null;
    notes: Set<string>;
    dishes: Set<string>;
    items: Map<string, ItemShare>;
    purchases: Map<string, PurchaseRef>;
  }
  const lines = new Map<string, Line>();
  for (const row of rows) {
    for (const ingredient of row.ingredients) {
      const formKey = normalizeForm(ingredient.form) ?? '';
      const { family, base } = amountOf(ingredient, row.servings, row.recipeServings);
      const identity = { key: ingredient.key, formKey, family };
      const id = lineIdOf(identity);
      const line = lines.get(id) ?? {
        ...identity,
        name: ingredient.name,
        form: ingredient.form,
        notes: new Set<string>(),
        dishes: new Set<string>(),
        items: new Map<string, ItemShare>(),
        purchases: new Map(),
      };
      lines.set(id, line);
      line.dishes.add(row.recipeName);
      if (base === null && ingredient.note) line.notes.add(ingredient.note);
      const share = line.items.get(row.itemId) ?? {
        required: ZERO,
        covered: ZERO,
        coveredFlag: false,
        purchases: new Map<string, PurchaseRef>(),
      };
      // The same ingredient twice in one dish adds up within that dish.
      share.required = base === null ? share.required : add(share.required, base);
      line.items.set(row.itemId, share);
    }
  }
  for (const allocation of allocations) {
    const line = lines.get(lineIdOf(allocation));
    const share = line?.items.get(allocation.itemId);
    if (!line || !share) continue;
    if (allocation.quantity === null) share.coveredFlag = true;
    else share.covered = add(share.covered, allocation.quantity);
    const purchase = {
      id: allocation.purchaseId,
      by: allocation.purchasedBy,
      at: allocation.purchasedAt,
      shared: (allocation.purchaseItems ?? 1) > 1,
    };
    line.purchases.set(allocation.purchaseId, purchase);
    share.purchases.set(allocation.purchaseId, purchase);
  }
  const newestFirst = (purchases: Map<string, PurchaseRef>) =>
    [...purchases.values()].sort((a, b) => b.at.getTime() - a.at.getTime());

  return [...lines.entries()]
    .map(([lineId, line]) => {
      const unquantified = line.family === UNQUANTIFIED;
      const outstanding: { itemId: string; quantity: Rational | null }[] = [];
      let toBuy = ZERO;
      let bought = ZERO;
      let openItems = 0;
      let coveredItems = 0;
      // One task per order item (UX-003): the same reconciliation, limited to that dish's share.
      const items: ItemTask[] = [];
      for (const [itemId, share] of line.items) {
        if (unquantified) {
          const itemOutstanding = share.coveredFlag ? [] : [{ itemId, quantity: null }];
          if (share.coveredFlag) coveredItems += 1;
          else {
            openItems += 1;
            outstanding.push(...itemOutstanding);
          }
          items.push({
            itemId,
            state: share.coveredFlag ? 'bought' : 'open',
            required: null,
            toBuy: null,
            bought: null,
            partlyBought: false,
            token: tokenOf(itemOutstanding),
            purchases: newestFirst(share.purchases),
            remaining: null,
          });
          continue;
        }
        const remaining = subtract(share.required, share.covered);
        const itemBought = min(share.covered, share.required);
        const itemOpen = isPositive(remaining);
        if (itemOpen) {
          toBuy = add(toBuy, remaining);
          outstanding.push({ itemId, quantity: remaining });
        }
        bought = add(bought, itemBought);
        items.push({
          itemId,
          state: itemOpen ? 'open' : 'bought',
          required: present(share.required, line.family),
          toBuy: itemOpen ? present(remaining, line.family) : null,
          bought: isPositive(itemBought) ? present(itemBought, line.family) : null,
          partlyBought: itemOpen && isPositive(itemBought),
          token: tokenOf(itemOpen ? [{ itemId, quantity: remaining }] : []),
          purchases: newestFirst(share.purchases),
          remaining: itemOpen ? remaining : null,
        });
      }
      const open = unquantified ? openItems > 0 : isPositive(toBuy);
      const anyBought = unquantified ? coveredItems > 0 : isPositive(bought);
      const token = tokenOf(outstanding);
      return {
        lineId,
        key: line.key,
        name: line.name,
        form: line.form,
        family: line.family,
        unquantified,
        notes: [...line.notes],
        dishes: [...line.dishes].sort(),
        state: open ? ('open' as const) : ('bought' as const),
        toBuy: !unquantified && open ? present(toBuy, line.family) : null,
        bought: !unquantified && anyBought ? present(bought, line.family) : null,
        partlyBought: open && anyBought,
        token,
        purchases: newestFirst(line.purchases),
        outstanding,
        total: unquantified ? null : toBuy,
        items,
      };
    })
    .sort(
      (a, b) =>
        Number(a.state === 'bought') - Number(b.state === 'bought') ||
        a.key.localeCompare(b.key, 'en') ||
        (a.form ?? '').localeCompare(b.form ?? '', 'en') ||
        a.family.localeCompare(b.family, 'en'),
    );
}

/**
 * The by-day tasks of each order item, in the dish's own ingredient order. Repeated lines of one
 * ingredient identity within a dish are one task, as they are one share of the checklist line.
 */
export function itemTasks(rows: DemandRow[], checklist: ReturnType<typeof buildChecklist>) {
  const byLine = new Map(checklist.map((line) => [line.lineId, line]));
  const tasks = new Map<string, (Omit<ItemTask, 'remaining'> & TaskLine)[]>();
  for (const row of rows) {
    const seen = new Set<string>();
    const list: (Omit<ItemTask, 'remaining'> & TaskLine)[] = [];
    for (const ingredient of row.ingredients) {
      const formKey = normalizeForm(ingredient.form) ?? '';
      const { family } = amountOf(ingredient, row.servings, row.recipeServings);
      const lineId = lineIdOf({ key: ingredient.key, formKey, family });
      if (seen.has(lineId)) continue;
      seen.add(lineId);
      const line = byLine.get(lineId);
      const share = line?.items.find((item) => item.itemId === row.itemId);
      if (!line || !share) continue;
      const notes = row.ingredients
        .filter(
          (other) =>
            other.key === ingredient.key &&
            (normalizeForm(other.form) ?? '') === formKey &&
            other.quantity === null &&
            other.note,
        )
        .map((other) => other.note!);
      const shown: Partial<ItemTask> = { ...share };
      delete shown.remaining;
      list.push({
        ...(shown as Omit<ItemTask, 'remaining'>),
        lineId,
        name: ingredient.name,
        form: ingredient.form,
        unquantified: line.unquantified,
        notes: [...new Set(notes)],
      });
    }
    tasks.set(row.itemId, list);
  }
  return tasks;
}

interface TaskLine {
  lineId: string;
  name: string;
  form: string | null;
  unquantified: boolean;
  notes: string[];
}
