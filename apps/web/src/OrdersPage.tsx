import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, LogIn, Pencil, Plus, Star, X } from 'lucide-react';
import {
  api,
  ApiError,
  dayLabel,
  signInUrl,
  type HouseholdSummary,
  type MealOrder,
  type MealOrderDetail,
  type RecipeSummary,
  type Session,
} from './api';
import { OrderEditor, type OrderStart } from './OrderEditor';

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  /** A dish chosen from the menu to start a new order with. */
  prefill: { recipeId: string; servings: number } | null;
  onPrefillUsed: () => void;
  onGoHousehold: () => void;
}

export function OrdersPage({ session, household, prefill, onPrefillUsed, onGoHousehold }: Props) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [orders, setOrders] = useState<MealOrder[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [editor, setEditor] = useState<OrderStart | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const householdId = household?.id;

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [nextOrders, nextRecipes] = await Promise.all([
        api<MealOrder[]>(`/households/${householdId}/orders?view=${view}`),
        api<RecipeSummary[]>(`/households/${householdId}/recipes`),
      ]);
      setOrders(nextOrders);
      setRecipes(nextRecipes.filter((recipe) => !recipe.archived));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load meal orders.');
    }
  }, [householdId, view]);
  useEffect(() => {
    setOrders(null);
    void load();
  }, [load]);
  // Refresh when returning to the tab: other members may have changed orders meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !editor) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, editor]);
  useEffect(() => {
    if (prefill && householdId && recipes) {
      setEditor({ mode: 'create', recipeId: prefill.recipeId, servings: prefill.servings });
      onPrefillUsed();
    }
  }, [prefill, householdId, recipes, onPrefillUsed]);

  if (!session) return <p role="status">Loading…</p>;
  if (!session.authenticated || !household) {
    return (
      <div className="empty-state">
        <CalendarDays size={36} />
        <h2>Good meals start with a plan.</h2>
        <p>
          {session.authenticated
            ? 'Create or join a household to plan meals together.'
            : 'Sign in to plan meals with your household.'}
        </p>
        {session.authenticated ? (
          <button className="primary-button" onClick={onGoHousehold}>
            Go to Household
          </button>
        ) : session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/meals')}>
            <LogIn size={18} /> Sign in with Google
          </a>
        ) : null}
      </div>
    );
  }

  if (editor && recipes) {
    return (
      <OrderEditor
        householdId={household.id}
        timezone={household.timezone}
        recipes={recipes}
        start={editor}
        onCancel={() => setEditor(null)}
        onSaved={async (saved) => {
          setEditor(null);
          setView('pending');
          setNotice(
            `Saved: ${saved.items.map((item) => item.recipeName).join(', ')} for ${dayLabel(saved.mealDate, saved.timezone).toLowerCase()} at ${saved.mealTime}.`,
          );
          await load();
        }}
      />
    );
  }

  async function close(order: MealOrder, action: 'complete' | 'cancel') {
    if (action === 'cancel' && !window.confirm('Cancel this meal order?')) return;
    setBusyId(order.id);
    setError('');
    setNotice('');
    try {
      await api(`/households/${householdId}/orders/${order.id}/${action}`, {
        method: 'POST',
        body: { expectedRevision: order.revision },
      });
      setNotice(action === 'complete' ? 'Marked as done. Enjoy!' : 'Order cancelled.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the order.');
    } finally {
      setBusyId(null);
      await load();
    }
  }
  async function edit(order: MealOrder) {
    setError('');
    try {
      setEditor({
        mode: 'edit',
        order: await api<MealOrderDetail>(`/households/${householdId}/orders/${order.id}`),
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open the order.');
      await load();
    }
  }

  const groups = new Map<string, MealOrder[]>();
  for (const order of orders ?? []) {
    groups.set(order.mealDate, [...(groups.get(order.mealDate) ?? []), order]);
  }
  const now = Date.now();

  return (
    <div className="orders-layout">
      <div className="menu-tools">
        <div className="filters" aria-label="Order views">
          <button aria-pressed={view === 'pending'} onClick={() => setView('pending')}>
            Upcoming
          </button>
          <button aria-pressed={view === 'history'} onClick={() => setView('history')}>
            History
          </button>
        </div>
        <div className="menu-actions">
          <button
            className="primary-button"
            onClick={() => {
              setNotice('');
              setEditor({ mode: 'create' });
            }}
          >
            <Plus size={18} /> New meal order
          </button>
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {orders === null ? (
        <p role="status">Loading meal orders…</p>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={32} />
          <h2>{view === 'pending' ? 'Nothing planned yet' : 'No finished meals yet'}</h2>
          <p>
            {view === 'pending'
              ? 'Order dishes from your household menu for now or for later. Everyone in the household can change pending orders.'
              : 'Completed and cancelled orders appear here.'}
          </p>
        </div>
      ) : (
        [...groups.entries()].map(([date, dayOrders]) => (
          <section key={date} className="order-day" aria-labelledby={`day-${date}`}>
            <h2 id={`day-${date}`}>{dayLabel(date, household.timezone)}</h2>
            {dayOrders.map((order) => {
              const overdue =
                order.status === 'pending' &&
                new Date(order.scheduledAt).getTime() < now - 3_600_000;
              return (
                <article
                  className="order-card"
                  key={order.id}
                  aria-label={`Meal at ${order.mealTime}`}
                >
                  <div className="order-head">
                    <strong className="order-time">{order.mealTime}</strong>
                    {order.timezone !== household.timezone && (
                      <span className="muted">
                        {order.timezone} (UTC{order.utcOffset})
                      </span>
                    )}
                    {overdue && <span className="status-tag overdue">Overdue</span>}
                    {order.status !== 'pending' && (
                      <span className={`status-tag ${order.status}`}>
                        {order.status === 'completed' ? 'Done' : 'Cancelled'}
                      </span>
                    )}
                    <span className="order-points">
                      <Star size={13} aria-hidden="true" /> {order.totalPoints} pts
                    </span>
                  </div>
                  <ul className="order-items">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span>{item.recipeName}</span>
                        <span className="muted">
                          {item.servings} serving{item.servings === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && <p className="order-notes">“{order.notes}”</p>}
                  <p className="muted">
                    Ordered by {order.createdBy}
                    {order.revision > 1 && order.status === 'pending'
                      ? ` · changed by ${order.updatedBy}`
                      : ''}
                    {order.closedBy
                      ? ` · ${order.status === 'completed' ? 'done' : 'cancelled'} by ${order.closedBy}`
                      : ''}
                  </p>
                  {order.status === 'pending' && (
                    <div className="form-actions">
                      <button
                        className="primary-button"
                        disabled={busyId === order.id}
                        onClick={() => close(order, 'complete')}
                      >
                        <Check size={16} /> Done
                      </button>
                      <button className="text-button" onClick={() => edit(order)}>
                        <Pencil size={16} /> Edit
                      </button>
                      <button
                        className="text-button"
                        disabled={busyId === order.id}
                        onClick={() => close(order, 'cancel')}
                      >
                        <X size={16} /> Cancel order
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
