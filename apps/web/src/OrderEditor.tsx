import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, localToday, type MealOrderDetail, type RecipeSummary } from './api';

export type OrderStart =
  | { mode: 'create'; recipeId?: string; servings?: number }
  | { mode: 'edit'; order: MealOrderDetail };

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

let nextKey = 1;

interface Props {
  householdId: string;
  timezone: string;
  recipes: RecipeSummary[];
  start: OrderStart;
  onCancel: () => void;
  onSaved: (order: MealOrderDetail) => void;
}

/**
 * Create or edit a pending meal order. The server resolves the household-local time; when a
 * daylight-saving change makes it ambiguous, the member chooses which occurrence they mean.
 */
export function OrderEditor({ householdId, timezone, recipes, start, onCancel, onSaved }: Props) {
  const editing = start.mode === 'edit' ? start.order : null;
  const [timing, setTiming] = useState<'now' | 'scheduled'>(editing ? 'scheduled' : 'now');
  const [date, setDate] = useState(editing?.mealDate ?? localToday(timezone));
  const [time, setTime] = useState(editing?.mealTime ?? '18:00');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    editing
      ? editing.items.map((item) => ({
          key: nextKey++,
          itemId: item.id,
          name: item.recipeName,
          servings: String(item.servings),
        }))
      : [
          {
            key: nextKey++,
            recipeId:
              start.mode === 'create' && start.recipeId ? start.recipeId : (recipes[0]?.id ?? ''),
            servings: String(
              (start.mode === 'create' && start.servings) || recipes[0]?.servings || 2,
            ),
          },
        ],
  );
  const [revision, setRevision] = useState(editing?.revision ?? 0);
  const [requestId] = useState(() => crypto.randomUUID());
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [disambiguation, setDisambiguation] = useState<'earlier' | 'later' | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

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
    setError('');
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
      setError(caught instanceof ApiError ? caught.message : 'Could not save the order.');
      setConflict(caught instanceof ApiError && caught.status === 409 && editing !== null);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatest() {
    if (!editing) return;
    setError('');
    setConflict(false);
    try {
      const latest = await api<MealOrderDetail>(`/households/${householdId}/orders/${editing.id}`);
      if (latest.status !== 'pending') {
        setError(`This order was ${latest.status} by ${latest.closedBy}.`);
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
      setError(caught instanceof ApiError ? caught.message : 'Could not load the order.');
    }
  }

  const noRecipes = recipes.length === 0;
  return (
    <form className="card-panel recipe-editor" onSubmit={submit} aria-labelledby="order-title">
      <p className="eyebrow">MEAL ORDER</p>
      <h2 id="order-title" tabIndex={-1} ref={heading}>
        {editing ? 'Edit meal order' : 'New meal order'}
      </h2>

      <fieldset className="choice-group">
        <legend>When</legend>
        {!editing && (
          <label className="choice">
            <input
              type="radio"
              name="timing"
              checked={timing === 'now'}
              onChange={() => changeTime(() => setTiming('now'))}
            />
            As soon as possible
          </label>
        )}
        <label className="choice">
          <input
            type="radio"
            name="timing"
            checked={timing === 'scheduled'}
            onChange={() => changeTime(() => setTiming('scheduled'))}
          />
          {editing ? 'Planned for' : 'Plan for later'}
        </label>
        {timing === 'scheduled' && (
          <div className="field-row">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                required
                onChange={(event) => changeTime(() => setDate(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Time</span>
              <input
                type="time"
                value={time}
                required
                onChange={(event) => changeTime(() => setTime(event.target.value))}
              />
            </label>
          </div>
        )}
        <p className="muted">Times are in the household time zone, {timezone}.</p>
      </fieldset>

      {choices && timing === 'scheduled' && (
        <fieldset className="choice-group">
          <legend>{time} happens twice that day. Which one do you mean?</legend>
          {choices.map((choice) => (
            <label className="choice" key={choice.disambiguation}>
              <input
                type="radio"
                name="disambiguation"
                checked={disambiguation === choice.disambiguation}
                onChange={() => setDisambiguation(choice.disambiguation)}
              />
              {choice.disambiguation === 'earlier' ? 'The first' : 'The second'} {time} (UTC
              {choice.utcOffset})
            </label>
          ))}
        </fieldset>
      )}

      <h3>Dishes</h3>
      {noRecipes && !editing && (
        <p className="muted">Add a recipe to your menu first; orders are made from the menu.</p>
      )}
      {lines.map((line, index) => (
        <fieldset className="order-line" key={line.key}>
          <legend className="sr-only">Dish {index + 1}</legend>
          {line.itemId ? (
            <p className="order-line-name">
              {line.name}
              <span className="muted"> · as ordered</span>
            </p>
          ) : (
            <label className="field wide">
              <span>Dish {index + 1}</span>
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
            <span>Servings{line.itemId ? ` for ${line.name}` : ''}</span>
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
            aria-label={`Remove dish ${index + 1}`}
            disabled={lines.length === 1}
            onClick={() => setLines(lines.filter((_, i) => i !== index))}
          >
            <Trash2 size={18} />
          </button>
        </fieldset>
      ))}
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
        <Plus size={16} /> Add dish
      </button>

      <label className="field wide">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          rows={2}
          maxLength={1000}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
          {conflict && (
            <button type="button" className="text-button" onClick={loadLatest}>
              Load the latest version (discards your changes)
            </button>
          )}
        </div>
      )}
      <div className="form-actions">
        <button
          className="primary-button"
          disabled={busy || (noRecipes && !editing) || (choices !== null && !disambiguation)}
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Place order'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
