import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, LogIn, Pencil, Star, X } from 'lucide-react';
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
import { useViewHistory } from './history';
import { useI18n } from './i18n';

type Notice =
  | { kind: 'saved'; names: string; date: string; timezone: string; time: string }
  | { kind: 'done' | 'cancel' };

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  placed: MealOrderDetail | null;
  onPlacedShown: () => void;
  onGoHousehold: () => void;
}

export function OrdersPage({ session, household, placed, onPlacedShown, onGoHousehold }: Props) {
  const { language, t, apiError } = useI18n();
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [orders, setOrders] = useState<MealOrder[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [editor, setEditor] = useState<OrderStart | null>(null);
  // Back from the order editor returns to the list, not the previous page (UX-004).
  useViewHistory(editor ? ['editor'] : [], () => setEditor(null));
  const [error, setError] = useState<ApiError | 'load' | 'update' | 'open' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
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
      setError(caught instanceof ApiError ? caught : 'load');
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
    if (!placed) return;
    setView('pending');
    setNotice({
      kind: 'saved',
      names: placed.items.map((item) => item.recipeName).join(', '),
      date: placed.mealDate,
      timezone: placed.timezone,
      time: placed.mealTime,
    });
    onPlacedShown();
  }, [placed, onPlacedShown]);

  if (!session) return <p role="status">{t('join.loading')}</p>;
  if (!session.authenticated || !household) {
    return (
      <div className="empty-state">
        <CalendarDays size={36} />
        <h2>{t('orders.welcome')}</h2>
        <p>{session.authenticated ? t('orders.needHousehold') : t('orders.signInPrompt')}</p>
        {session.authenticated ? (
          <button className="primary-button" onClick={onGoHousehold}>
            {t('menu.goHousehold')}
          </button>
        ) : session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/meals')}>
            <LogIn size={18} /> {t('join.signInGoogle')}
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
          setNotice({
            kind: 'saved',
            names: saved.items.map((item) => item.recipeName).join(', '),
            date: saved.mealDate,
            timezone: saved.timezone,
            time: saved.mealTime,
          });
          await load();
        }}
      />
    );
  }

  async function close(order: MealOrder, action: 'complete' | 'cancel') {
    if (action === 'cancel' && !window.confirm(t('orders.cancelConfirm'))) return;
    setBusyId(order.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/households/${householdId}/orders/${order.id}/${action}`, {
        method: 'POST',
        body: { expectedRevision: order.revision },
      });
      setNotice({ kind: action === 'complete' ? 'done' : 'cancel' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'update');
    } finally {
      setBusyId(null);
      await load();
    }
  }
  async function edit(order: MealOrder) {
    setError(null);
    try {
      setEditor({
        mode: 'edit',
        order: await api<MealOrderDetail>(`/households/${householdId}/orders/${order.id}`),
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'open');
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
        <div className="filters" role="group" aria-label={t('orders.views')}>
          <button aria-pressed={view === 'pending'} onClick={() => setView('pending')}>
            {t('orders.upcoming')}
          </button>
          <button aria-pressed={view === 'history'} onClick={() => setView('history')}>
            {t('orders.history')}
          </button>
        </div>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice.kind === 'saved'
            ? t('orders.saved', {
                names: notice.names,
                day: dayLabel(notice.date, notice.timezone, language).toLowerCase(),
                time: notice.time,
              })
            : t(notice.kind === 'done' ? 'orders.doneNotice' : 'orders.cancelNotice')}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError
            ? apiError(error)
            : t(
                error === 'load'
                  ? 'orders.loadFailed'
                  : error === 'update'
                    ? 'orders.updateFailed'
                    : 'orders.openFailed',
              )}
        </p>
      )}
      {orders === null ? (
        <p role="status">{t('orders.loading')}</p>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={32} />
          <h2>{t(view === 'pending' ? 'orders.emptyPending' : 'orders.emptyHistory')}</h2>
          <p>{view === 'pending' ? t('orders.pendingHint') : t('orders.historyHint')}</p>
        </div>
      ) : (
        [...groups.entries()].map(([date, dayOrders]) => (
          <section key={date} className="order-day" aria-labelledby={`day-${date}`}>
            <h2 id={`day-${date}`}>{dayLabel(date, household.timezone, language)}</h2>
            {dayOrders.map((order) => {
              const overdue =
                order.status === 'pending' &&
                new Date(order.scheduledAt).getTime() < now - 3_600_000;
              return (
                <article
                  className="order-card"
                  key={order.id}
                  aria-label={t('orders.mealAt', { time: order.mealTime })}
                >
                  <div className="order-head">
                    <strong className="order-time">{order.mealTime}</strong>
                    {order.timezone !== household.timezone && (
                      <span className="muted">
                        {order.timezone} (UTC{order.utcOffset})
                      </span>
                    )}
                    {overdue && <span className="status-tag overdue">{t('orders.overdue')}</span>}
                    {order.status !== 'pending' && (
                      <span className={`status-tag ${order.status}`}>
                        {t(order.status === 'completed' ? 'orders.done' : 'orders.cancelled')}
                      </span>
                    )}
                    <span className="order-points">
                      <Star size={13} aria-hidden="true" />{' '}
                      {t('orders.points', { count: order.totalPoints })}
                    </span>
                  </div>
                  <ul className="order-items">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span>{item.recipeName}</span>
                        <span className="muted">
                          {t(item.servings === 1 ? 'orders.oneServing' : 'orders.servings', {
                            count: item.servings,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && <p className="order-notes">“{order.notes}”</p>}
                  <p className="muted">
                    {t('orders.orderedBy', { name: order.createdBy })}
                    {order.revision > 1 && order.status === 'pending'
                      ? t('orders.changedBy', { name: order.updatedBy })
                      : ''}
                    {order.closedBy
                      ? t(order.status === 'completed' ? 'orders.doneBy' : 'orders.cancelledBy', {
                          name: order.closedBy,
                        })
                      : ''}
                  </p>
                  {order.status === 'pending' && (
                    <div className="form-actions">
                      <button
                        className="primary-button"
                        disabled={busyId === order.id}
                        onClick={() => close(order, 'complete')}
                      >
                        <Check size={16} /> {t('orders.done')}
                      </button>
                      <button className="text-button" onClick={() => edit(order)}>
                        <Pencil size={16} /> {t('menu.edit')}
                      </button>
                      <button
                        className="text-button"
                        disabled={busyId === order.id}
                        onClick={() => close(order, 'cancel')}
                      >
                        <X size={16} /> {t('orders.cancel')}
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
