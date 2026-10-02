import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  api,
  ApiError,
  UNITS,
  unitLabel,
  type AiDraft,
  type Ingredient,
  type RecipeContent,
  type RecipeDetail,
} from './api';
import { useI18n } from './i18n';

export type EditorStart =
  | { mode: 'create'; presetId?: string; content?: RecipeContent }
  | { mode: 'ai'; draft: AiDraft & { draft: RecipeContent } }
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
  /** AI drafts only: called after the draft was discarded. */
  onDiscarded?: () => void;
}

/**
 * Create or edit a household recipe. The server validates everything; the form only prevents
 * obvious mistakes. Edits carry the revision that was opened so a concurrent change by another
 * member is reported instead of overwritten.
 */
export function RecipeEditor({ householdId, start, onCancel, onSaved, onDiscarded }: Props) {
  const { language, t, apiError } = useI18n();
  const [draft, setDraft] = useState<Draft>(() =>
    start.mode === 'edit'
      ? toDraft(start.recipe)
      : start.mode === 'ai'
        ? toDraft(start.draft.draft)
        : toDraft(start.content ?? { ingredients: [], steps: [] }),
  );
  const [revision, setRevision] = useState(start.mode === 'edit' ? start.recipe.revision : 0);
  // One id per editor session: retries of the same save cannot create a second recipe.
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | 'save' | 'discard' | 'load' | null>(null);
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
    setError(null);
    setConflict(false);
    try {
      const saved = recipeId
        ? await api<RecipeDetail>(`/households/${householdId}/recipes/${recipeId}`, {
            method: 'PUT',
            body: { ...toBody(draft), expectedRevision: revision },
          })
        : start.mode === 'ai'
          ? // Saving the same draft twice returns the recipe from the first save.
            await api<RecipeDetail>(`/households/${householdId}/ai-drafts/${start.draft.id}/save`, {
              method: 'POST',
              body: toBody(draft),
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
      setError(caught instanceof ApiError ? caught : 'save');
      setConflict(caught instanceof ApiError && caught.status === 409 && recipeId !== null);
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (start.mode !== 'ai') return;
    setBusy(true);
    setError(null);
    try {
      await api(`/households/${householdId}/ai-drafts/${start.draft.id}/discard`, {
        method: 'POST',
      });
      onDiscarded?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'discard');
    } finally {
      setBusy(false);
    }
  }

  async function loadLatest() {
    if (!recipeId) return;
    setError(null);
    setConflict(false);
    try {
      const latest = await api<RecipeDetail>(`/households/${householdId}/recipes/${recipeId}`);
      setDraft(toDraft(latest));
      setRevision(latest.revision);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'load');
    }
  }

  const title = t(
    start.mode === 'edit'
      ? 'recipeEditor.edit'
      : start.mode === 'ai'
        ? 'recipeEditor.reviewAi'
        : start.presetId
          ? 'recipeEditor.saveStarter'
          : 'recipeEditor.new',
  );

  return (
    <form className="card-panel recipe-editor" onSubmit={submit} aria-labelledby="editor-title">
      <p className="eyebrow">{t('recipeEditor.eyebrow')}</p>
      <h2 id="editor-title" tabIndex={-1} ref={heading}>
        {title}
      </h2>
      {start.mode === 'ai' && (
        <p className="notice ai-notice">
          {t('recipeEditor.aiNotice', {
            model: start.draft.model,
            dish: start.draft.dishName,
          })}
        </p>
      )}
      {start.mode === 'create' && start.presetId && (
        <p className="muted">{t('recipeEditor.starterNotice')}</p>
      )}
      <label className="field">
        <span>{t('recipeEditor.name')}</span>
        <input
          value={draft.name}
          onChange={(event) => update({ name: event.target.value })}
          maxLength={120}
          required
        />
      </label>
      <label className="field">
        <span>{t('recipeEditor.description')}</span>
        <input
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          maxLength={500}
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t('recipeEditor.serves')}</span>
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
          <span>{t('recipeEditor.points')}</span>
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
        {t('recipeEditor.pointsHelp')}
      </p>

      <h3>{t('recipeEditor.ingredients')}</h3>
      <p className="muted">{t('recipeEditor.amountsHelp')}</p>
      {draft.ingredients.map((line, index) => (
        <fieldset className="ingredient-row" key={line.key}>
          <legend>{t('recipeEditor.ingredient', { number: index + 1 })}</legend>
          <label className="field wide">
            <span>{t('recipeEditor.ingredientName')}</span>
            <input
              value={line.name}
              onChange={(event) => updateLine(index, { name: event.target.value })}
              maxLength={100}
              required
            />
          </label>
          <label className="field">
            <span>{t('recipeEditor.amount')}</span>
            <input
              inputMode="decimal"
              pattern="\d+(\.\d{1,3})?"
              title={t('recipeEditor.amountTitle')}
              value={line.quantity}
              onChange={(event) => updateLine(index, { quantity: event.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('recipeEditor.unit')}</span>
            <select
              value={line.unit}
              onChange={(event) => updateLine(index, { unit: event.target.value })}
            >
              <option value="">{t('recipeEditor.none')}</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabel(unit, language)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('recipeEditor.preparation')}</span>
            <input
              value={line.form}
              onChange={(event) => updateLine(index, { form: event.target.value })}
              maxLength={60}
              placeholder={t('recipeEditor.preparationPlaceholder')}
            />
          </label>
          <label className="field">
            <span>{t('recipeEditor.note')}</span>
            <input
              value={line.note}
              onChange={(event) => updateLine(index, { note: event.target.value })}
              maxLength={200}
              placeholder={t('recipeEditor.notePlaceholder')}
            />
          </label>
          <button
            type="button"
            className="icon-button small"
            aria-label={t('recipeEditor.removeIngredient', { number: index + 1 })}
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
        <Plus size={16} /> {t('recipeEditor.addIngredient')}
      </button>

      <h3>{t('menu.method')}</h3>
      {draft.steps.map((step, index) => (
        <div className="step-row" key={step.key}>
          <label className="field wide">
            <span>{t('recipeEditor.step', { number: index + 1 })}</span>
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
            aria-label={t('recipeEditor.removeStep', { number: index + 1 })}
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
        <Plus size={16} /> {t('recipeEditor.addStep')}
      </button>

      {error && (
        <div className="form-error" role="alert">
          <p>
            {error instanceof ApiError
              ? apiError(error)
              : t(
                  error === 'save'
                    ? 'recipeEditor.saveFailed'
                    : error === 'discard'
                      ? 'recipeEditor.discardFailed'
                      : 'recipeEditor.loadFailed',
                )}
          </p>
          {conflict && (
            <button type="button" className="text-button" onClick={loadLatest}>
              {t('recipeEditor.latest')}
            </button>
          )}
        </div>
      )}
      <div className="form-actions">
        <button className="primary-button" disabled={busy}>
          {t(busy ? 'recipeEditor.saving' : 'recipeEditor.save')}
        </button>
        {start.mode === 'ai' && (
          <button type="button" className="text-button" disabled={busy} onClick={discardDraft}>
            {t('recipeEditor.discard')}
          </button>
        )}
        <button type="button" className="text-button" onClick={onCancel}>
          {t(start.mode === 'ai' ? 'recipeEditor.later' : 'orderEditor.cancel')}
        </button>
      </div>
    </form>
  );
}
