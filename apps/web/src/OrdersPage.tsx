import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, LogIn, Pencil, Star, X } from 'lucide-react';
import {
  api,
  ApiError,
  dayLabel,
  signInUrl,
  type Category,
  type HouseholdSummary,
  type MealOrder,
  type MealOrderDetail,
  type RecipeSummary,
  type Session,
} from './api';
import type { BasketControls } from './basket';
import { DishBrowser } from './DishBrowser';
import { OrderEditor, type OrderStart } from './OrderEditor';
import { useI18n } from './i18n';

type Notice =
  | { kind: 'saved'; names: string; date: string; timezone: string; time: string }
  | { kind: 'added'; name: string }
  | { kind: 'done' | 'cancel' | 'unavailable' };

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  /** The household's unsent order. */
  basket: BasketControls;
  /** Name of a dish just added to the basket from the Menu, to confirm once. */
  added: string | null;
  onAddedShown: () => void;
  onGoHousehold: () => void;
}

export function OrdersPage({
  session,
  household,
  basket,
  added,
  onAddedShown,
  onGoHousehold,
}: Props) {
  const { language, t, apiError } = useI18n();
  const [view, setView] = useState<'browse' | 'pending' | 'history'>('browse');
  const [orders, setOrders] = useState<MealOrder[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  /** The household the loaded recipes belong to; a switch must not prune the new basket. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [editor, setEditor] = useState<OrderStart | null>(null);
  const [error, setError] = useState<ApiError | 'load' | 'update' | 'open' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const householdId = household?.id;

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [nextOrders, nextRecipes, nextCategories] = await Promise.all([
        view === 'browse'
          ? Promise.resolve([])
          : api<MealOrder[]>(`/households/${householdId}/orders?view=${view}`),
        api<RecipeSummary[]>(`/households/${householdId}/recipes`),
        api<Category[]>(`/households/${householdId}/categories`),
      ]);
      setOrders(nextOrders);
      setRecipes(nextRecipes.filter((recipe) => !recipe.archived));
      setCategories(nextCategories);
      setLoadedFor(householdId);
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
    if (added) {
      setNotice({ kind: 'added', name: added });
      onAddedShown();
    }
  }, [added, onAddedShown]);
  // Dishes archived since they were added cannot be ordered; take them out and say so.
  const { basket: unsent, setServings } = basket;
  useEffect(() => {
    if (!recipes || loadedFor !== householdId) return;
    const gone = unsent.items.filter((item) => !recipes.some((r) => r.id === item.recipeId));
    if (gone.length === 0) return;
    for (const item of gone) setServings(item.recipeId, 0);
    setNotice({ kind: 'unavailable' });
  }, [recipes, loadedFor, householdId, unsent.items, setServings]);

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
        basket={editor.mode === 'basket' ? basket : undefined}
        onCancel={() => setEditor(null)}
        onSaved={async (saved) => {
          if (editor.mode === 'basket') basket.clear();
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
          <button aria-pressed={view === 'browse'} onClick={() => setView('browse')}>
            {unsent.items.length > 0
              ? t('orders.browseCount', { count: unsent.items.length })
              : t('orders.browse')}
          </button>
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
            : notice.kind === 'added'
              ? t('basket.addedNotice', { name: notice.name })
              : t(
                  notice.kind === 'done'
                    ? 'orders.doneNotice'
                    : notice.kind === 'cancel'
                      ? 'orders.cancelNotice'
                      : 'basket.unavailable',
                )}
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
      {view === 'browse' ? (
        recipes === null ? (
          <p role="status">{t('menu.loading')}</p>
        ) : (
          <DishBrowser
            recipes={recipes}
            categories={categories}
            basket={basket}
            onReview={() => {
              setNotice(null);
              setEditor({ mode: 'basket' });
              window.scrollTo({ top: 0 });
            }}
          />
        )
      ) : orders === null ? (
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
