import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, localToday, type MealOrderDetail, type RecipeSummary } from './api';
import type { BasketControls } from './basket';
import { useI18n } from './i18n';

/** A new order is placed from the basket; an existing pending order is edited directly. */
export type OrderStart = { mode: 'basket' } | { mode: 'edit'; order: MealOrderDetail };

interface Line {
  key: number;
  /** Existing item: its snapshot is kept. */
  itemId?: string;
  name?: string;
  /** New dish: chosen from the active menu. */
  recipeId?: string;
  servings: string;
}

interface Choice {
  disambiguation: 'earlier' | 'later';
  utcOffset: string;
}

type ErrorState =
  | ApiError
  | 'save'
  | 'load'
  | { kind: 'closed'; status: 'completed' | 'cancelled'; actor: string }
  | null;

let nextKey = 1;

interface Props {
  householdId: string;
  timezone: string;
  recipes: RecipeSummary[];
  start: OrderStart;
  /** Basket mode: the unsent order; edits here are kept in it when the member goes back. */
  basket?: BasketControls;
  onCancel: () => void;
  onSaved: (order: MealOrderDetail) => void;
}

/**
 * Create or edit a pending meal order. The server resolves the household-local time; when a
 * daylight-saving change makes it ambiguous, the member chooses which occurrence they mean.
 */
export function OrderEditor({
  householdId,
  timezone,
  recipes,
  start,
  basket,
  onCancel,
  onSaved,
}: Props) {
  const { language, t, apiError } = useI18n();
  const editing = start.mode === 'edit' ? start.order : null;
  const stored = basket?.basket;
  const [timing, setTiming] = useState<'now' | 'scheduled'>(
    editing ? 'scheduled' : (stored?.timing ?? 'now'),
  );
  const [date, setDate] = useState(editing?.mealDate ?? (stored?.date || localToday(timezone)));
  const [time, setTime] = useState(editing?.mealTime ?? stored?.time ?? '18:00');
  const [notes, setNotes] = useState(editing?.notes ?? stored?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    editing
      ? editing.items.map((item) => ({
          key: nextKey++,
          itemId: item.id,
          name: item.recipeName,
          servings: String(item.servings),
        }))
      : (stored?.items ?? []).map((item) => ({
          key: nextKey++,
          recipeId: item.recipeId,
          name: recipes.find((recipe) => recipe.id === item.recipeId)?.name,
          servings: String(item.servings),
        })),
  );
  const [revision, setRevision] = useState(editing?.revision ?? 0);
  // Basket orders reuse the basket's request id, so a retry cannot create a second order.
  const [ownRequestId] = useState(() => crypto.randomUUID());
  const requestId = stored?.requestId ?? ownRequestId;
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [disambiguation, setDisambiguation] = useState<'earlier' | 'later' | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorState>(null);
  const [conflict, setConflict] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);
  // Keep the basket in step with this form, so going back to the dishes loses nothing.
  const updateBasket = basket?.update;
  useEffect(() => {
    updateBasket?.({
      items: lines.map((line) => ({
        recipeId: line.recipeId ?? '',
        servings: Number(line.servings) || 1,
      })),
      notes,
      timing,
      date,
      time,
    });
  }, [updateBasket, lines, notes, timing, date, time]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function changeTime(update: () => void) {
    update();
    setChoices(null);
    setDisambiguation('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setConflict(false);
    const when =
      timing === 'now'
        ? { type: 'now' }
        : { type: 'scheduled', date, time, ...(disambiguation ? { disambiguation } : {}) };
    const items = lines.map((line) =>
      line.itemId
        ? { itemId: line.itemId, servings: Number(line.servings) }
        : { recipeId: line.recipeId, servings: Number(line.servings) },
    );
    try {
      const saved = editing
        ? await api<MealOrderDetail>(`/households/${householdId}/orders/${editing.id}`, {
            method: 'PUT',
            body: { expectedRevision: revision, when, notes, items },
          })
        : await api<MealOrderDetail>(`/households/${householdId}/orders`, {
            method: 'POST',
            body: { requestId, when, notes, items },
          });
      onSaved(saved);
    } catch (caught) {
      if (caught instanceof ApiError && caught.body?.code === 'ambiguous_time') {
        setChoices(caught.body.options as Choice[]);
      }
      setError(caught instanceof ApiError ? caught : 'save');
      setConflict(caught instanceof ApiError && caught.status === 409 && editing !== null);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatest() {
    if (!editing) return;
    setError(null);
    setConflict(false);
    try {
      const latest = await api<MealOrderDetail>(`/households/${householdId}/orders/${editing.id}`);
      if (latest.status !== 'pending') {
        setError({ kind: 'closed', status: latest.status, actor: latest.closedBy ?? '' });
        return;
      }
      setDate(latest.mealDate);
      setTime(latest.mealTime);
      setNotes(latest.notes);
      setLines(
        latest.items.map((item) => ({
          key: nextKey++,
          itemId: item.id,
          name: item.recipeName,
          servings: String(item.servings),
        })),
      );
      setRevision(latest.revision);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'load');
    }
  }

  const noRecipes = recipes.length === 0;
  return (
    <form className="card-panel recipe-editor" onSubmit={submit} aria-labelledby="order-title">
      <p className="eyebrow">{t('orderEditor.eyebrow')}</p>
      <h2 id="order-title" tabIndex={-1} ref={heading}>
        {t(editing ? 'orderEditor.editTitle' : 'orders.new')}
      </h2>

      <fieldset className="choice-group">
        <legend>{t('orderEditor.when')}</legend>
        {!editing && (
          <label className="choice">
            <input
              type="radio"
              name="timing"
              checked={timing === 'now'}
              onChange={() => changeTime(() => setTiming('now'))}
            />
            {t('orderEditor.now')}
          </label>
        )}
        <label className="choice">
          <input
            type="radio"
            name="timing"
            checked={timing === 'scheduled'}
            onChange={() => changeTime(() => setTiming('scheduled'))}
          />
          {t(editing ? 'orderEditor.plannedFor' : 'orderEditor.later')}
        </label>
        {timing === 'scheduled' && (
          <div className="field-row">
            <label className="field">
              <span>{t('orderEditor.date')}</span>
              <input
                type="date"
                value={date}
                required
                onChange={(event) => changeTime(() => setDate(event.target.value))}
              />
            </label>
            <label className="field">
              <span>{t('orderEditor.time')}</span>
              <input
                type="time"
                value={time}
                required
                onChange={(event) => changeTime(() => setTime(event.target.value))}
              />
            </label>
          </div>
        )}
        <p className="muted">{t('orderEditor.timezone', { timezone })}</p>
      </fieldset>

      {choices && timing === 'scheduled' && (
        <fieldset className="choice-group">
          <legend>{t('orderEditor.ambiguous', { time })}</legend>
          {choices.map((choice) => (
            <label className="choice" key={choice.disambiguation}>
              <input
                type="radio"
                name="disambiguation"
                checked={disambiguation === choice.disambiguation}
                onChange={() => setDisambiguation(choice.disambiguation)}
              />
              {t(choice.disambiguation === 'earlier' ? 'orderEditor.first' : 'orderEditor.second', {
                time,
                offset: choice.utcOffset,
              })}
            </label>
          ))}
        </fieldset>
      )}

      <h3>{t('orderEditor.dishes')}</h3>
      {lines.map((line, index) => (
        <fieldset className="order-line" key={line.key}>
          <legend className="sr-only">{t('orderEditor.dish', { number: index + 1 })}</legend>
          {line.itemId || basket ? (
            <p className="order-line-name">
              {line.name}
              {line.itemId && <span className="muted">{t('orderEditor.asOrdered')}</span>}
            </p>
          ) : (
            <label className="field wide">
              <span>{t('orderEditor.dish', { number: index + 1 })}</span>
              <select
                value={line.recipeId}
                required
                onChange={(event) => {
                  const chosen = recipes.find((recipe) => recipe.id === event.target.value);
                  updateLine(index, {
                    recipeId: event.target.value,
                    servings: String(chosen?.servings ?? line.servings),
                  });
                }}
              >
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field servings-field">
            <span>
              {line.itemId || basket
                ? t('orderEditor.servingsFor', { name: line.name ?? '' })
                : t('orderEditor.servings')}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={line.servings}
              required
              onChange={(event) => updateLine(index, { servings: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="icon-button small"
            aria-label={
              basket
                ? t('basket.removeDish', { name: line.name ?? '' })
                : t('orderEditor.removeDish', { number: index + 1 })
            }
            disabled={!basket && lines.length === 1}
            onClick={() => setLines(lines.filter((_, i) => i !== index))}
          >
            <Trash2 size={18} />
          </button>
        </fieldset>
      ))}
      {basket && lines.length === 0 && <p className="muted">{t('basket.emptyCheckout')}</p>}
      {!basket && (
        <button
          type="button"
          className="text-button"
          disabled={noRecipes || lines.length >= 20}
          onClick={() =>
            setLines([
              ...lines,
              {
                key: nextKey++,
                recipeId: recipes[0]?.id ?? '',
                servings: String(recipes[0]?.servings ?? 2),
              },
            ])
          }
        >
          <Plus size={16} /> {t('orderEditor.addDish')}
        </button>
      )}

      <label className="field wide">
        <span>{t('orderEditor.notes')}</span>
        <textarea
          value={notes}
          rows={2}
          maxLength={1000}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error && (
        <div className="form-error" role="alert">
          <p>
            {error instanceof ApiError
              ? apiError(error)
              : typeof error === 'object'
                ? t('orderEditor.closed', {
                    status:
                      language === 'zh'
                        ? t(error.status === 'completed' ? 'orders.done' : 'orders.cancelled')
                        : error.status,
                    name: error.actor,
                  })
                : t(error === 'save' ? 'orderEditor.saveFailed' : 'orderEditor.loadFailed')}
          </p>
          {conflict && (
            <button type="button" className="text-button" onClick={loadLatest}>
              {t('orderEditor.latest')}
            </button>
          )}
        </div>
      )}
      <div className="form-actions">
        <button
          className="primary-button"
          disabled={busy || lines.length === 0 || (choices !== null && !disambiguation)}
        >
          {t(busy ? 'orderEditor.saving' : editing ? 'orderEditor.save' : 'orderEditor.place')}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          {t(basket ? 'basket.addMore' : 'orderEditor.cancel')}
        </button>
      </div>
    </form>
  );
}
