import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, type Category } from './api';
import { useI18n } from './i18n';

type Editing =
  { kind: 'rename'; id: string; name: string } | { kind: 'delete'; id: string; moveTo: string };
type Notice =
  | { kind: 'added' | 'renamed'; name: string }
  | { kind: 'deleted'; name: string; count: number }
  | null;
type ManagerError = { error: ApiError | 'save' | 'delete' } | null;

interface Props {
  householdId: string;
  categories: Category[];
  /** Reloads categories and recipes after a change. */
  onChanged: () => Promise<void>;
  onClose: () => void;
}

/**
 * Household categories (ADR 0007). Every member may add, rename and delete them. Deleting asks
 * where the category's recipes go; nothing is deleted except the category itself.
 */
export function CategoryManager({ householdId, categories, onChanged, onClose }: Props) {
  const { t, apiError } = useI18n();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState<ManagerError>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const base = `/households/${householdId}/categories`;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function run(action: () => Promise<Notice>, failure: 'save' | 'delete') {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      setEditing(null);
      setNotice(next);
    } catch (caught) {
      setError({ error: caught instanceof ApiError ? caught : failure });
    } finally {
      setBusy(false);
      await onChanged();
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const created = await api<Category>(base, { method: 'POST', body: { name } });
      setName('');
      return { kind: 'added', name: created.name };
    }, 'save');
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    if (editing?.kind !== 'rename' || !editing.name.trim()) return;
    const { id, name: next } = editing;
    void run(async () => {
      const renamed = await api<Category>(`${base}/${id}`, { method: 'PUT', body: { name: next } });
      return { kind: 'renamed', name: renamed.name };
    }, 'save');
  }

  function remove(category: Category, moveTo: string) {
    void run(async () => {
      const result = await api<{ moved: number }>(`${base}/${category.id}/delete`, {
        method: 'POST',
        body: { moveTo: moveTo || null },
      });
      return { kind: 'deleted', name: category.name, count: result.moved };
    }, 'delete');
  }

  return (
    <div className="card-panel category-manager" aria-labelledby="category-title">
      <p className="eyebrow">{t('category.eyebrow')}</p>
      <h2 id="category-title" tabIndex={-1} ref={heading}>
        {t('category.manageTitle')}
      </h2>
      <p className="muted">{t('category.manageHint')}</p>

      <form className="category-form" onSubmit={add}>
        <label className="field">
          <span>{t('category.newName')}</span>
          <input
            value={name}
            maxLength={40}
            placeholder={t('category.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="secondary-button" disabled={busy || !name.trim()}>
          <Plus size={16} aria-hidden="true" /> {t('category.add')}
        </button>
      </form>

      <p className="notice-slot" role="status">
        {notice && (
          <span className="notice">
            {notice.kind === 'deleted'
              ? t('category.deletedNotice', { name: notice.name, count: notice.count })
              : t(notice.kind === 'added' ? 'category.addedNotice' : 'category.renamedNotice', {
                  name: notice.name,
                })}
          </span>
        )}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error.error instanceof ApiError
            ? apiError(error.error)
            : t(error.error === 'save' ? 'category.saveFailed' : 'category.deleteFailed')}
        </p>
      )}

      {categories.length === 0 ? (
        <p className="muted">{t('category.empty')}</p>
      ) : (
        <ul className="category-list">
          {categories.map((category) => {
            const total = category.recipeCount + category.archivedCount;
            return (
              <li key={category.id}>
                {editing?.kind === 'rename' && editing.id === category.id ? (
                  <form className="category-form" onSubmit={rename}>
                    <label className="field">
                      <span>{t('category.renameLabel', { name: category.name })}</span>
                      <input
                        value={editing.name}
                        maxLength={40}
                        autoFocus
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                    </label>
                    <button className="secondary-button" disabled={busy || !editing.name.trim()}>
                      {t('category.saveName')}
                    </button>
                    <button type="button" className="text-button" onClick={() => setEditing(null)}>
                      {t('category.cancel')}
                    </button>
                  </form>
                ) : editing?.kind === 'delete' && editing.id === category.id ? (
                  <div
                    className="category-form"
                    role="group"
                    aria-labelledby={`delete-${category.id}`}
                  >
                    <p id={`delete-${category.id}`} className="category-name">
                      {t('category.deleteTitle', { name: category.name })}
                    </p>
                    <p className="muted">{t('category.deleteHint', { count: total })}</p>
                    <label className="field">
                      <span>{t('category.moveTo')}</span>
                      <select
                        value={editing.moveTo}
                        autoFocus
                        onChange={(event) => setEditing({ ...editing, moveTo: event.target.value })}
                      >
                        <option value="">{t('category.uncategorised')}</option>
                        {categories
                          .filter((other) => other.id !== category.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="secondary-button danger"
                      disabled={busy}
                      onClick={() => remove(category, editing.moveTo)}
                    >
                      {t('category.confirmDelete')}
                    </button>
                    <button type="button" className="text-button" onClick={() => setEditing(null)}>
                      {t('category.cancel')}
                    </button>
                  </div>
                ) : (
                  <>
                    <span>
                      <span className="category-name">{category.name}</span>
                      <br />
                      <span className="muted">
                        {category.recipeCount === 1
                          ? t('category.oneCount')
                          : t('category.count', { count: category.recipeCount })}
                        {category.archivedCount > 0 &&
                          t('category.archivedCount', { count: category.archivedCount })}
                      </span>
                    </span>
                    <span className="category-row-actions">
                      <button
                        className="icon-button small"
                        aria-label={t('category.rename', { name: category.name })}
                        onClick={() =>
                          setEditing({ kind: 'rename', id: category.id, name: category.name })
                        }
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="icon-button small"
                        aria-label={t('category.delete', { name: category.name })}
                        onClick={() => setEditing({ kind: 'delete', id: category.id, moveTo: '' })}
                      >
                        <Trash2 size={18} />
                      </button>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('category.back')}
      </button>
    </div>
  );
}
