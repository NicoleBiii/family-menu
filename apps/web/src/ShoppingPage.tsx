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
  type HouseholdSummary,
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
 * response, so they always describe the same orders.
 */
export function ShoppingPage({ session, household, onGoMeals, onGoHousehold }: Props) {
  const { language, t, apiError } = useI18n();
  const [view, setView] = useState<'combined' | 'grouped'>('combined');
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(() => (household ? localToday(household.timezone) : ''));
  const [to, setTo] = useState(() => (household ? localToday(household.timezone, 6) : ''));
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState<ApiError | 'load' | null>(null);
  const householdId = household?.id;

  const load = useCallback(async () => {
    if (!householdId) return;
    if (range && (!from || !to)) return;
    setError(null);
    try {
      const query = range ? `?from=${from}&to=${to}` : '';
      setList(await api<ShoppingList>(`/households/${householdId}/shopping${query}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'load');
    }
  }, [householdId, range, from, to]);
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

  const generated = list
    ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
        timeZone: household.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(list.generatedAt))
    : '';

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
          <button className="icon-button" aria-label={t('shopping.refresh')} onClick={load}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError ? apiError(error) : t('shopping.loadFailed')}
        </p>
      )}
      {list === null ? (
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
        <ul className="shopping-list" aria-label={t('shopping.combinedList')}>
          {list.combined.map((entry) => (
            <li key={`${entry.key}|${entry.form ?? ''}`}>
              <div>
                <strong>{entry.name}</strong>
                {entry.form && <span className="muted">, {entry.form}</span>}
                <p className="muted small">
                  {t('shopping.for', { dishes: entry.dishes.join(', ') })}
                </p>
              </div>
              <div className="shopping-amounts">
                {entry.amounts.map((amount) => (
                  <span key={`${amount.unit}`}>{formatAmount(amount, language)}</span>
                ))}
                {entry.unquantified.length > 0 && (
                  <span className="muted">
                    {entry.amounts.length > 0 ? '+ ' : ''}
                    {entry.unquantified
                      .map((note) => note ?? t('shopping.amountUnknown'))
                      .join(', ')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
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
        list.combined.some((entry) => entry.amounts.some((amount) => amount.approximate)) && (
          <p className="sample-note">{t('shopping.approximate')}</p>
        )}
    </div>
  );
}
