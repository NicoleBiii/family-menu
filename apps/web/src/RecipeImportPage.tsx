import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, UNITS, type Category, type ImportPreview, type ImportReceipt } from './api';
import { useI18n } from './i18n';

const EXAMPLE = JSON.stringify(
  {
    version: 1,
    recipes: [
      {
        name: 'Tomato and egg stir-fry',
        category: 'Home cooking',
        description: 'Serve with rice.',
        servings: 2,
        pricePoints: 0,
        ingredients: [
          { name: 'Tomato', quantity: '300', unit: 'g' },
          { name: 'Egg', quantity: '3', unit: 'piece' },
        ],
        steps: ['Scramble the eggs and set aside.', 'Cook tomatoes, return the eggs and season.'],
      },
    ],
  },
  null,
  2,
);

function key(name: string) {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface Props {
  householdId: string;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function RecipeImportPage({ householdId, onDone, onDirtyChange }: Props) {
  const { language, t } = useI18n();
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [requestId, setRequestId] = useState(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null);
  const [copied, setCopied] = useState('');
  const [householdCategories, setHouseholdCategories] = useState<Category[]>([]);
  const bytes = new TextEncoder().encode(JSON.stringify({ text: input })).length;
  const dirty = input.length > 0 && !receipt;

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    setInput('');
    setPreview(null);
    setSelected([]);
    setChoices({});
    setReceipt(null);
    setError('');
    setRequestId(crypto.randomUUID());
    let active = true;
    api<Category[]>(`/households/${householdId}/categories`)
      .then((categories) => {
        if (active) setHouseholdCategories(categories);
      })
      .catch(() => {
        if (active) setHouseholdCategories([]);
      });
    return () => {
      active = false;
    };
  }, [householdId]);

  const uniqueCategories = useMemo(() => {
    if (!preview) return [];
    const seen = new Set<string>();
    return preview.rows
      .filter((row) => selected.includes(row.index) && row.category)
      .flatMap((row) => {
        const normalized = key(row.category!);
        if (seen.has(normalized)) return [];
        seen.add(normalized);
        return [{ key: normalized, name: row.category!, matchingId: row.matchingCategoryId }];
      });
  }, [preview, selected]);
  const newCategories = uniqueCategories.filter((category) => choices[category.key] === 'create');
  const missingChoices = uniqueCategories.some((category) => !choices[category.key]);
  const duplicateRows = (preview?.rows ?? [])
    .filter((row) => selected.includes(row.index) && row.duplicate)
    .map((row) => row.index);
  const canCommit =
    selected.length > 0 &&
    selected.length <= (preview?.remainingRecipes ?? 0) &&
    newCategories.length <= (preview?.remainingCategories ?? 0) &&
    !missingChoices &&
    !busy;

  function resetConfirmation() {
    setRequestId(crypto.randomUUID());
    setReceipt(null);
    setError('');
  }
  function showError(caught: unknown, fallback: string) {
    if (!(caught instanceof ApiError)) return fallback;
    if (caught.status === 413) return t('import.tooLarge');
    if (caught.status === 429) return t('import.tooFrequent');
    if (caught.status === 409) return t('import.stale');
    return language === 'zh' ? `${fallback} ${caught.message}` : caught.message;
  }
  function changeInput(text: string) {
    setInput(text);
    setPreview(null);
    setSelected([]);
    setChoices({});
    resetConfirmation();
  }
  async function copy(text: string, kind: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setError(t('import.copyFailed'));
    }
  }
  async function check() {
    setBusy(true);
    setError('');
    setPreview(null);
    setReceipt(null);
    try {
      const result = await api<ImportPreview>(`/households/${householdId}/recipe-imports/preview`, {
        method: 'POST',
        body: { text: input },
      });
      setPreview(result);
      setHouseholdCategories(
        result.categories.map((category) => ({ ...category, recipeCount: 0, archivedCount: 0 })),
      );
      setSelected(
        result.rows.filter((row) => row.recipe && !row.duplicate).map((row) => row.index),
      );
      setChoices(
        Object.fromEntries(
          result.rows
            .filter((row) => row.category && row.matchingCategoryId)
            .map((row) => [key(row.category!), row.matchingCategoryId!]),
        ),
      );
      setRequestId(crypto.randomUUID());
    } catch (caught) {
      setError(showError(caught, t('import.checkFailed')));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview || !canCommit) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<ImportReceipt>(`/households/${householdId}/recipe-imports`, {
        method: 'POST',
        body: {
          text: input,
          requestId,
          selected,
          keepDuplicates: duplicateRows,
          categoryChoices: choices,
          stateHash: preview.stateHash,
        },
      });
      setReceipt(result);
      onDirtyChange(false);
    } catch (caught) {
      setError(showError(caught, t('import.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  const prompt =
    language === 'zh'
      ? `请为我的家庭菜单生成 10–20 道菜。只输出一个完整 JSON 对象，不要解释或 Markdown。严格遵守下面的 version 1 范例结构：\n${EXAMPLE}\n每道菜包含 name、servings、ingredients、steps；category 可为家庭现有分类之一：${householdCategories.map((c) => c.name).join('、') || '暂无'}，也可以提出简短新分类。食材数量是整道菜（servings 份）的总量。quantity 用正数小数字符串，最多三位小数；不知道数量时用 null。unit 只能是 ${UNITS.join(', ')} 或 null。虚拟价格 pricePoints 可省略。不要猜测不确定的食材数量或单位。请生成这些菜：【在这里填写菜名或口味要求】。`
      : `Create 10–20 recipes for my household menu. Output one complete JSON object only, with no commentary or Markdown. Follow this version 1 example:\n${EXAMPLE}\nEach recipe needs name, servings, ingredients and steps. Reuse household categories when suitable: ${householdCategories.map((c) => c.name).join(', ') || 'none yet'}. A short new category is allowed. Ingredient quantities describe the entire recipe at its base servings. Use positive decimal strings with at most three places, or null if unknown. Units may only be ${UNITS.join(', ')} or null. pricePoints is optional virtual display points. Do not guess unknown quantities or units. Dishes/preferences: [fill in here].`;

  return (
    <section className="page-panel import-page">
      <h1>{t('import.title')}</h1>
      <p>{t('import.intro')}</p>
      <p>{t('import.privacy')}</p>
      <p>{t('import.requirements', { units: UNITS.join(', ') })}</p>
      <div className="form-actions">
        <button className="secondary-button" onClick={() => void copy(prompt, 'prompt')}>
          {t('import.copyPrompt')}
        </button>
        <button className="secondary-button" onClick={() => void copy(EXAMPLE, 'example')}>
          {t('import.copyExample')}
        </button>
        {copied && <span role="status">{t('import.copied')}</span>}
      </div>
      <details>
        <summary>{t('import.instructions')}</summary>
        <pre>{prompt}</pre>
      </details>
      <details>
        <summary>{t('import.example')}</summary>
        <pre>{EXAMPLE}</pre>
      </details>
      <label htmlFor="import-text">{t('import.paste')}</label>
      <textarea
        id="import-text"
        value={input}
        onChange={(event) => changeInput(event.target.value)}
        rows={12}
        spellCheck={false}
      />
      <p>{t('import.limits', { bytes, count: 524288 })}</p>
      <button
        className="primary-button"
        disabled={busy || !input.trim() || bytes > 524288}
        onClick={() => void check()}
      >
        {busy ? t('import.working') : t('import.check')}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview && !receipt && (
        <section aria-labelledby="import-preview-title">
          <h2 id="import-preview-title">{t('import.preview')}</h2>
          <p>
            {t('import.capacity', {
              recipes: preview.remainingRecipes,
              categories: preview.remainingCategories,
            })}
          </p>
          <ul className="import-list">
            {preview.rows.map((row) => (
              <li key={row.index}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.index)}
                    disabled={!row.recipe}
                    onChange={(event) => {
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, row.index].sort((a, b) => a - b)
                          : current.filter((n) => n !== row.index),
                      );
                      resetConfirmation();
                    }}
                  />
                  <strong>{row.name}</strong> — {row.category ?? t('category.uncategorised')}
                </label>
                {row.duplicate && (
                  <p>{t(row.duplicate === 'archived' ? 'import.archived' : 'import.duplicate')}</p>
                )}
                {row.errors.map((issue, index) => (
                  <p key={index} className="form-error">
                    {issue}
                  </p>
                ))}
                {row.recipe && (
                  <details>
                    <summary>{t('import.details')}</summary>
                    <p>
                      {t('import.servings', { count: row.recipe.servings })} ·{' '}
                      {row.recipe.ingredients.length} {t('import.ingredients')} ·{' '}
                      {row.recipe.steps.length} {t('import.steps')}
                    </p>
                    <ol>
                      {row.recipe.ingredients.map((line, index) => (
                        <li key={index}>
                          {line.name}: {line.quantity ?? '—'} {line.unit ?? ''}
                        </li>
                      ))}
                    </ol>
                    <ol>
                      {row.recipe.steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {uniqueCategories.length > 0 && (
            <fieldset>
              <legend>{t('import.categories')}</legend>
              {uniqueCategories.map((category) => (
                <label key={category.key} className="import-category">
                  <span>{category.name}</span>
                  <select
                    value={choices[category.key] ?? ''}
                    onChange={(event) => {
                      setChoices((current) => ({ ...current, [category.key]: event.target.value }));
                      resetConfirmation();
                    }}
                  >
                    <option value="">{t('import.chooseCategory')}</option>
                    <option value="none">{t('category.uncategorised')}</option>
                    <option
                      value="create"
                      disabled={
                        !category.matchingId &&
                        newCategories.length >= preview.remainingCategories &&
                        choices[category.key] !== 'create'
                      }
                    >
                      {t('import.createCategory')}
                    </option>
                    {preview.categories.map((existing) => (
                      <option key={existing.id} value={existing.id}>
                        {existing.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          {selected.some((index) => !preview.rows[index]?.recipe?.ingredients.length) && (
            <p>{t('import.noIngredients')}</p>
          )}
          <button className="primary-button" disabled={!canCommit} onClick={() => void commit()}>
            {t('import.confirm', { recipes: selected.length, categories: newCategories.length })}
          </button>
        </section>
      )}
      {receipt && (
        <div role="status">
          <h2>{t('import.saved', { count: receipt.imported })}</h2>
          <p>{t('import.createdCategories', { count: receipt.createdCategories })}</p>
          <button className="primary-button" onClick={onDone}>
            {t('import.return')}
          </button>
        </div>
      )}
    </section>
  );
}
