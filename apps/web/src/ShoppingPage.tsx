import { useCallback, useEffect, useState } from 'react';
import { LogIn, RefreshCw, ShoppingBasket } from 'lucide-react';
import {
  api,
  ApiError,
  dayLabel,
  formatAmount,
  formatIngredient,
  localToday,
  signInUrl,
  type ChecklistLine,
  type HouseholdSummary,
  type Purchase,
  type Session,
  type ShoppingList,
} from './api';
import { useI18n } from './i18n';

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  onGoMeals: () => void;
  onGoHousehold: () => void;
}

/**
 * What the household needs for its pending meal orders. Both views come from one server
 * response, so they always describe the same orders. Checks are shared by the household and
 * reconciled against the orders they covered (ADR 0009): only later demand returns.
 */
export function ShoppingPage({ session, household, onGoMeals, onGoHousehold }: Props) {
  const { language, t, apiError } = useI18n();
  const [view, setView] = useState<'combined' | 'grouped' | 'history'>('combined');
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(() => (household ? localToday(household.timezone) : ''));
  const [to, setTo] = useState(() => (household ? localToday(household.timezone, 6) : ''));
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState<ApiError | 'load' | 'update' | null>(null);
  const [history, setHistory] = useState<Purchase[] | null>(null);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const householdId = household?.id;

  /** `keepError` keeps a check's error visible while the list is refreshed after it. */
  const load = useCallback(
    async (keepError = false) => {
      if (!householdId) return;
      if (range && (!from || !to)) return;
      if (!keepError) setError(null);
      try {
        const query = range ? `?from=${from}&to=${to}` : '';
        const [nextList, nextHistory] = await Promise.all([
          api<ShoppingList>(`/households/${householdId}/shopping${query}`),
          view === 'history'
            ? api<Purchase[]>(`/households/${householdId}/shopping/purchases`)
            : Promise.resolve(null),
        ]);
        setList(nextList);
        if (nextHistory) setHistory(nextHistory);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught : 'load');
      }
    },
    [householdId, range, from, to, view],
  );

  /** Records that the member bought what this line showed, for the meals in scope. */
  async function check(line: ChecklistLine) {
    setBusyLine(line.lineId);
    setError(null);
    try {
      await api(`/households/${householdId}/shopping/purchases`, {
        method: 'POST',
        body: {
          requestId: crypto.randomUUID(),
          lineId: line.lineId,
          token: line.token,
          ...(range ? { from, to } : {}),
        },
      });
    } catch (caught) {
      // Another member checked it or an order changed: show the current list instead.
      setError(caught instanceof ApiError ? caught : 'update');
    } finally {
      setBusyLine(null);
      await load(true);
    }
  }
  /** Unchecking voids the purchases that cover this line; they stay in history. */
  async function uncheck(line: ChecklistLine) {
    setBusyLine(line.lineId);
    setError(null);
    try {
      for (const purchase of line.purchases) {
        await api(`/households/${householdId}/shopping/purchases/${purchase.id}/undo`, {
          method: 'POST',
        });
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'update');
    } finally {
      setBusyLine(null);
      await load(true);
    }
  }
  useEffect(() => {
    void load();
  }, [load]);
  // Recalculate when returning to the tab; other members may have changed orders.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (!session) return <p role="status">{t('join.loading')}</p>;
  if (!session.authenticated || !household) {
    return (
      <div className="empty-state">
        <ShoppingBasket size={36} />
        <h2>{t('shopping.welcome')}</h2>
        <p>{session.authenticated ? t('shopping.needHousehold') : t('shopping.signInPrompt')}</p>
        {session.authenticated ? (
          <button className="primary-button" onClick={onGoHousehold}>
            {t('menu.goHousehold')}
          </button>
        ) : session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/shopping')}>
            <LogIn size={18} /> {t('join.signInGoogle')}
          </a>
        ) : null}
      </div>
    );
  }

  const clock = (value: string, withDate = false) =>
    new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
      timeZone: household.timezone,
      ...(withDate ? { month: 'short', day: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  const generated = list ? clock(list.generatedAt) : '';
  const lineName = (line: { name: string; form: string | null }) =>
    line.form ? `${line.name}, ${line.form}` : line.name;
  const open = list?.checklist.filter((line) => line.state === 'open') ?? [];
  const bought = list?.checklist.filter((line) => line.state === 'bought') ?? [];
  const lineAmount = (line: ChecklistLine) =>
    line.unquantified
      ? line.notes.join(', ') || t('shopping.amountUnknown')
      : line.toBuy
        ? formatAmount(line.toBuy, language)
        : line.bought
          ? formatAmount(line.bought, language)
          : '';
  const renderLine = (line: ChecklistLine) => {
    const isBought = line.state === 'bought';
    const latest = line.purchases[0];
    return (
      <li key={line.lineId} className={isBought ? 'checked' : undefined}>
        <label className="check-line">
          <input
            type="checkbox"
            // Shows the member's choice while it is saved; the reload then confirms it.
            checked={busyLine === line.lineId ? !isBought : isBought}
            disabled={busyLine === line.lineId}
            aria-label={t(isBought ? 'shopping.markNotBought' : 'shopping.markBought', {
              name: lineName(line),
              amount: lineAmount(line),
            })}
            onChange={() => (isBought ? uncheck(line) : check(line))}
          />
          <span>
            <strong>{line.name}</strong>
            {line.form && <span className="muted">, {line.form}</span>}
            <span className="muted small block">
              {isBought && latest
                ? t('shopping.boughtBy', { name: latest.by, time: clock(latest.at, true) })
                : t('shopping.for', { dishes: line.dishes.join(', ') })}
            </span>
            {line.partlyBought && (
              <span className="muted small block">
                {line.bought
                  ? t('shopping.alreadyBought', { amount: formatAmount(line.bought, language) })
                  : t('shopping.alreadyBoughtSome')}
              </span>
            )}
          </span>
        </label>
        <div className="shopping-amounts">
          <span className={line.unquantified ? 'muted' : undefined}>{lineAmount(line)}</span>
        </div>
      </li>
    );
  };

  return (
    <div className="orders-layout">
      <fieldset className="choice-group">
        <legend>{t('shopping.scope')}</legend>
        <label className="choice">
          <input type="radio" name="scope" checked={!range} onChange={() => setRange(false)} />
          {t('shopping.allPending')}
        </label>
        <label className="choice">
          <input type="radio" name="scope" checked={range} onChange={() => setRange(true)} />
          {t('shopping.dateRange')}
        </label>
        {range && (
          <div className="field-row">
            <label className="field">
              <span>{t('shopping.from')}</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              <span>{t('shopping.to')}</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        )}
      </fieldset>
      <div className="menu-tools">
        <div className="filters" aria-label={t('shopping.views')}>
          <button aria-pressed={view === 'combined'} onClick={() => setView('combined')}>
            {t('shopping.combined')}
          </button>
          <button aria-pressed={view === 'grouped'} onClick={() => setView('grouped')}>
            {t('shopping.byDay')}
          </button>
          <button aria-pressed={view === 'history'} onClick={() => setView('history')}>
            {t('shopping.history')}
          </button>
        </div>
        <div className="menu-actions">
          <span className="muted" role="status">
            {list
              ? t(list.orderCount === 1 ? 'shopping.oneUpdated' : 'shopping.updated', {
                  count: list.orderCount,
                  time: generated,
                })
              : ''}
          </span>
          <button className="icon-button" aria-label={t('shopping.refresh')} onClick={() => load()}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError
            ? apiError(error)
            : t(error === 'load' ? 'shopping.loadFailed' : 'shopping.updateFailed')}
        </p>
      )}
      {view === 'history' ? (
        history === null ? (
          <p role="status">{t('shopping.adding')}</p>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <ShoppingBasket size={32} />
            <h2>{t('shopping.noHistory')}</h2>
            <p>{t('shopping.historyHint')}</p>
          </div>
        ) : (
          <ul className="shopping-list history-list" aria-label={t('shopping.history')}>
            {history.map((purchase) => (
              <li key={purchase.id} className={purchase.undoneAt ? 'undone' : undefined}>
                <div>
                  <strong>{lineName(purchase)}</strong>
                  <p className="muted small">
                    {t('shopping.boughtBy', {
                      name: purchase.purchasedBy,
                      time: clock(purchase.purchasedAt, true),
                    })}
                    {purchase.undoneAt &&
                      t('shopping.undoneBy', {
                        name: purchase.undoneBy ?? '',
                        time: clock(purchase.undoneAt, true),
                      })}
                  </p>
                </div>
                <div className="shopping-amounts">
                  <span>
                    {purchase.amount
                      ? formatAmount(purchase.amount, language)
                      : t('shopping.unquantifiedBought')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : list === null ? (
        <p role="status">{t('shopping.adding')}</p>
      ) : list.orderCount === 0 ? (
        <div className="empty-state">
          <ShoppingBasket size={32} />
          <h2>{t('shopping.nothing')}</h2>
          <p>{range ? t('shopping.noRange') : t('shopping.noOrders')}</p>
          <button className="primary-button" onClick={onGoMeals}>
            {t('shopping.plan')}
          </button>
        </div>
      ) : view === 'combined' ? (
        <>
          {open.length > 0 ? (
            <ul className="shopping-list" aria-label={t('shopping.combinedList')}>
              {open.map(renderLine)}
            </ul>
          ) : (
            <p className="notice">{t('shopping.allBought')}</p>
          )}
          {bought.length > 0 && (
            <>
              <h2 className="shopping-subheading">{t('shopping.boughtHeading')}</h2>
              <ul className="shopping-list" aria-label={t('shopping.boughtList')}>
                {bought.map(renderLine)}
              </ul>
            </>
          )}
        </>
      ) : (
        list.grouped.map((group) => (
          <section
            key={group.mealDate}
            className="order-day"
            aria-labelledby={`shop-${group.mealDate}`}
          >
            <h2 id={`shop-${group.mealDate}`}>
              {dayLabel(group.mealDate, household.timezone, language)}
            </h2>
            {group.orders.map((order) => (
              <article
                className="order-card"
                key={order.orderId}
                aria-label={t('shopping.mealAt', { time: order.mealTime })}
              >
                <strong className="order-time">{order.mealTime}</strong>
                {order.items.map((item) => (
                  <div key={item.itemId} className="shopping-dish">
                    <h3>
                      {item.recipeName}{' '}
                      <span className="muted">
                        {t(item.servings === 1 ? 'shopping.oneServing' : 'shopping.servings', {
                          count: item.servings,
                        })}
                      </span>
                    </h3>
                    <ul>
                      {item.ingredients.map((line, index) => (
                        <li key={index}>
                          {line.approximate ? '≈ ' : ''}
                          {formatIngredient(line, language)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </section>
        ))
      )}
      {list &&
        view !== 'history' &&
        list.combined.some((entry) => entry.amounts.some((amount) => amount.approximate)) && (
          <p className="sample-note">{t('shopping.approximate')}</p>
        )}
    </div>
  );
}
