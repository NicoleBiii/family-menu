import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  api,
  ApiError,
  UNITS,
  type Ingredient,
  type RecipeContent,
  type RecipeDetail,
} from './api';

export type EditorStart =
  | { mode: 'create'; presetId?: string; content?: RecipeContent }
  | { mode: 'edit'; recipe: RecipeDetail };

interface DraftLine {
  key: number;
  name: string;
  quantity: string;
  unit: string;
  form: string;
  note: string;
}

interface Draft {
  name: string;
  description: string;
  servings: string;
  pricePoints: string;
  steps: { key: number; text: string }[];
  ingredients: DraftLine[];
}

let nextKey = 1;
const key = () => nextKey++;

function toDraft(content: Partial<RecipeContent> & { pricePoints?: number }): Draft {
  return {
    name: content.name ?? '',
    description: content.description ?? '',
    servings: String(content.servings ?? 2),
    pricePoints: String(content.pricePoints ?? 0),
    steps: (content.steps ?? []).map((text) => ({ key: key(), text })),
    ingredients: (content.ingredients ?? []).map((line: Ingredient) => ({
      key: key(),
      name: line.name,
      quantity: line.quantity ?? '',
      unit: line.unit ?? '',
      form: line.form ?? '',
      note: line.note ?? '',
    })),
  };
}

const emptyLine = (): DraftLine => ({
  key: key(),
  name: '',
  quantity: '',
  unit: '',
  form: '',
  note: '',
});

function toBody(draft: Draft) {
  return {
    name: draft.name,
    description: draft.description,
    servings: Number(draft.servings),
    pricePoints: Number(draft.pricePoints || 0),
    steps: draft.steps.map((step) => step.text).filter((text) => text.trim()),
    ingredients: draft.ingredients
      .filter((line) => line.name.trim() || line.quantity.trim())
      .map((line) => ({
        name: line.name,
        quantity: line.quantity.trim() || null,
        unit: line.unit || null,
        form: line.form || null,
        note: line.note || null,
      })),
  };
}

interface Props {
  householdId: string;
  start: EditorStart;
  onCancel: () => void;
  onSaved: (recipe: RecipeDetail) => void;
}

/**
 * Create or edit a household recipe. The server validates everything; the form only prevents
 * obvious mistakes. Edits carry the revision that was opened so a concurrent change by another
 * member is reported instead of overwritten.
 */
export function RecipeEditor({ householdId, start, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() =>
    start.mode === 'edit'
      ? toDraft(start.recipe)
      : toDraft(start.content ?? { ingredients: [], steps: [] }),
  );
  const [revision, setRevision] = useState(start.mode === 'edit' ? start.recipe.revision : 0);
  // One id per editor session: retries of the same save cannot create a second recipe.
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const recipeId = start.mode === 'edit' ? start.recipe.id : null;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  function updateLine(index: number, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setConflict(false);
    try {
      const saved = recipeId
        ? await api<RecipeDetail>(`/households/${householdId}/recipes/${recipeId}`, {
            method: 'PUT',
            body: { ...toBody(draft), expectedRevision: revision },
          })
        : await api<RecipeDetail>(`/households/${householdId}/recipes`, {
            method: 'POST',
            body: {
              ...toBody(draft),
              requestId,
              ...(start.mode === 'create' && start.presetId ? { presetId: start.presetId } : {}),
            },
          });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the recipe.');
      setConflict(caught instanceof ApiError && caught.status === 409 && recipeId !== null);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatest() {
    if (!recipeId) return;
    setError('');
    setConflict(false);
    try {
      const latest = await api<RecipeDetail>(`/households/${householdId}/recipes/${recipeId}`);
      setDraft(toDraft(latest));
      setRevision(latest.revision);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the recipe.');
    }
  }

  const title =
    start.mode === 'edit' ? 'Edit recipe' : start.presetId ? 'Save a starter recipe' : 'New recipe';

  return (
    <form className="card-panel recipe-editor" onSubmit={submit} aria-labelledby="editor-title">
      <p className="eyebrow">YOUR HOUSEHOLD MENU</p>
      <h2 id="editor-title" tabIndex={-1} ref={heading}>
        {title}
      </h2>
      {start.mode === 'create' && start.presetId && (
        <p className="muted">
          This saves your own copy. Change anything you like; the starter recipe stays as it is.
        </p>
      )}
      <label className="field">
        <span>Recipe name</span>
        <input
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          maxLength={120}
          required
        />
      </label>
      <label className="field">
        <span>Short description (optional)</span>
        <input
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          maxLength={500}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Serves</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={draft.servings}
            onChange={(event) => update({ servings: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Points per serving</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            value={draft.pricePoints}
            onChange={(event) => update({ pricePoints: event.target.value })}
            aria-describedby="points-help"
          />
        </label>
      </div>
      <p className="muted" id="points-help">
        Points are a playful menu price with no cash value.
      </p>

      <h3>Ingredients</h3>
      <p className="muted">
        Amounts are for the number of servings above. Leave the amount blank for “to taste”.
      </p>
      {draft.ingredients.map((line, index) => (
        <fieldset className="ingredient-row" key={line.key}>
          <legend>Ingredient {index + 1}</legend>
          <label className="field wide">
            <span>Name</span>
            <input
              value={line.name}
              onChange={(event) => updateLine(index, { name: event.target.value })}
              maxLength={100}
              required
            />
          </label>
          <label className="field">
            <span>Amount</span>
            <input
              inputMode="decimal"
              pattern="\d+(\.\d{1,3})?"
              title="A number such as 2 or 0.25"
              value={line.quantity}
              onChange={(event) => updateLine(index, { quantity: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Unit</span>
            <select
              value={line.unit}
              onChange={(event) => updateLine(index, { unit: event.target.value })}
            >
              <option value="">none</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Preparation</span>
            <input
              value={line.form}
              onChange={(event) => updateLine(index, { form: event.target.value })}
              maxLength={60}
              placeholder="e.g. diced"
            />
          </label>
          <label className="field">
            <span>Note</span>
            <input
              value={line.note}
              onChange={(event) => updateLine(index, { note: event.target.value })}
              maxLength={200}
              placeholder="e.g. to taste"
            />
          </label>
          <button
            type="button"
            className="icon-button small"
            aria-label={`Remove ingredient ${index + 1}`}
            onClick={() => update({ ingredients: draft.ingredients.filter((_, i) => i !== index) })}
          >
            <Trash2 size={18} />
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={draft.ingredients.length >= 60}
        onClick={() => update({ ingredients: [...draft.ingredients, emptyLine()] })}
      >
        <Plus size={16} /> Add ingredient
      </button>

      <h3>Method</h3>
      {draft.steps.map((step, index) => (
        <div className="step-row" key={step.key}>
          <label className="field wide">
            <span>Step {index + 1}</span>
            <textarea
              value={step.text}
              rows={2}
              maxLength={2000}
              onChange={(event) =>
                update({
                  steps: draft.steps.map((item, i) =>
                    i === index ? { ...item, text: event.target.value } : item,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="icon-button small"
            aria-label={`Remove step ${index + 1}`}
            onClick={() => update({ steps: draft.steps.filter((_, i) => i !== index) })}
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={draft.steps.length >= 30}
        onClick={() => update({ steps: [...draft.steps, { key: key(), text: '' }] })}
      >
        <Plus size={16} /> Add step
      </button>

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
        <button className="primary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
