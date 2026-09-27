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
  const [view, setView] = useState<'combined' | 'grouped'>('combined');
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(() => (household ? localToday(household.timezone) : ''));
  const [to, setTo] = useState(() => (household ? localToday(household.timezone, 6) : ''));
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState('');
  const householdId = household?.id;

  const load = useCallback(async () => {
    if (!householdId) return;
    if (range && (!from || !to)) return;
    setError('');
    try {
      const query = range ? `?from=${from}&to=${to}` : '';
      setList(await api<ShoppingList>(`/households/${householdId}/shopping${query}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the shopping list.');
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

  if (!session) return <p role="status">Loading…</p>;
  if (!session.authenticated || !household) {
    return (
      <div className="empty-state">
        <ShoppingBasket size={36} />
        <h2>A clearer list. An easier shop.</h2>
        <p>
          {session.authenticated
            ? 'Create or join a household; ingredients from its meal orders come together here.'
            : 'Sign in to see what your household needs to buy for its planned meals.'}
        </p>
        {session.authenticated ? (
          <button className="primary-button" onClick={onGoHousehold}>
            Go to Household
          </button>
        ) : session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/shopping')}>
            <LogIn size={18} /> Sign in with Google
          </a>
        ) : null}
      </div>
    );
  }

  const generated = list
    ? new Intl.DateTimeFormat('en', {
        timeZone: household.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(list.generatedAt))
    : '';

  return (
    <div className="orders-layout">
      <fieldset className="choice-group">
        <legend>Which meals</legend>
        <label className="choice">
          <input type="radio" name="scope" checked={!range} onChange={() => setRange(false)} />
          All pending orders, including overdue ones
        </label>
        <label className="choice">
          <input type="radio" name="scope" checked={range} onChange={() => setRange(true)} />
          Meals between two dates
        </label>
        {range && (
          <div className="field-row">
            <label className="field">
              <span>From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        )}
      </fieldset>
      <div className="menu-tools">
        <div className="filters" aria-label="Shopping views">
          <button aria-pressed={view === 'combined'} onClick={() => setView('combined')}>
            Combined
          </button>
          <button aria-pressed={view === 'grouped'} onClick={() => setView('grouped')}>
            By day
          </button>
        </div>
        <div className="menu-actions">
          <span className="muted" role="status">
            {list
              ? `${list.orderCount} order${list.orderCount === 1 ? '' : 's'} · updated ${generated}`
              : ''}
          </span>
          <button className="icon-button" aria-label="Refresh shopping list" onClick={load}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {list === null ? (
        <p role="status">Adding up ingredients…</p>
      ) : list.orderCount === 0 ? (
        <div className="empty-state">
          <ShoppingBasket size={32} />
          <h2>Nothing to buy yet</h2>
          <p>
            {range
              ? 'No pending meal orders fall between these dates.'
              : 'Ingredients appear here when your household has pending meal orders.'}
          </p>
          <button className="primary-button" onClick={onGoMeals}>
            Plan a meal
          </button>
        </div>
      ) : view === 'combined' ? (
        <ul className="shopping-list" aria-label="Combined shopping list">
          {list.combined.map((entry) => (
            <li key={`${entry.key}|${entry.form ?? ''}`}>
              <div>
                <strong>{entry.name}</strong>
                {entry.form && <span className="muted">, {entry.form}</span>}
                <p className="muted small">For {entry.dishes.join(', ')}</p>
              </div>
              <div className="shopping-amounts">
                {entry.amounts.map((amount) => (
                  <span key={`${amount.unit}`}>{formatAmount(amount)}</span>
                ))}
                {entry.unquantified.length > 0 && (
                  <span className="muted">
                    {entry.amounts.length > 0 ? '+ ' : ''}
                    {entry.unquantified.map((note) => note ?? 'amount not given').join(', ')}
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
            <h2 id={`shop-${group.mealDate}`}>{dayLabel(group.mealDate, household.timezone)}</h2>
            {group.orders.map((order) => (
              <article
                className="order-card"
                key={order.orderId}
                aria-label={`Meal at ${order.mealTime}`}
              >
                <strong className="order-time">{order.mealTime}</strong>
                {order.items.map((item) => (
                  <div key={item.itemId} className="shopping-dish">
                    <h3>
                      {item.recipeName}{' '}
                      <span className="muted">
                        · {item.servings} serving{item.servings === 1 ? '' : 's'}
                      </span>
                    </h3>
                    <ul>
                      {item.ingredients.map((line, index) => (
                        <li key={index}>
                          {line.approximate ? '≈ ' : ''}
                          {formatIngredient(line)}
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
          <p className="sample-note">≈ marks amounts rounded up after scaling servings.</p>
        )}
    </div>
  );
}
