import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { api, ApiError, type AiDraft, type AiOverview } from './api';
import { useI18n } from './i18n';

type ErrorState =
  | ApiError
  | 'load'
  | 'failed'
  | 'slow'
  | 'start'
  | 'discard'
  | { kind: 'provider'; code: string | null; message: string }
  | null;

interface Props {
  householdId: string;
  /** Opens the editor on a finished draft. */
  onReview: (draft: AiDraft) => void;
  onManual: () => void;
  onClose: () => void;
}

const POLL_MS = 1000;
/** The server fails a job after its provider timeout; stop polling a little after that. */
const GIVE_UP_MS = 90_000;

/**
 * Asks the server for an AI recipe draft and waits for it. The server queues the request and
 * enforces the household allowance and budget; this screen only polls and explains the result.
 * Nothing is added to the menu here: a finished draft opens in the editor, where a member
 * saves or discards it.
 */
export function AiDraftPanel({ householdId, onReview, onManual, onClose }: Props) {
  const { language, t, apiError, errorCode } = useI18n();
  const [overview, setOverview] = useState<AiOverview | null>(null);
  const [dishName, setDishName] = useState('');
  const [preferences, setPreferences] = useState('');
  // Kept across a network failure so that retrying cannot start a second draft.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<AiDraft | null>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const base = `/households/${householdId}/ai-drafts`;

  const load = useCallback(async () => {
    try {
      setOverview(await api<AiOverview>(base));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'load');
    }
  }, [base]);

  useEffect(() => {
    heading.current?.focus();
    void load();
  }, [load]);

  useEffect(() => {
    if (!pending || pending.status === 'succeeded' || pending.status === 'failed') return;
    const started = Date.now();
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const latest = await api<AiDraft>(`${base}/${pending.id}`);
        if (stopped) return;
        if (latest.status === 'succeeded') {
          onReview(latest);
          return;
        }
        if (latest.status === 'failed') {
          setPending(null);
          setFailed(true);
          setError(
            latest.errorMessage
              ? { kind: 'provider', code: latest.errorCode, message: latest.errorMessage }
              : 'failed',
          );
          void load();
          return;
        }
      } catch {
        // A dropped connection is retried by the next poll; the draft keeps running on the server.
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setPending(null);
        setError('slow');
        void load();
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    let timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, base, onReview, load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFailed(false);
    try {
      const draft = await api<AiDraft>(base, {
        method: 'POST',
        body: { requestId, dishName, preferences },
      });
      setRequestId(crypto.randomUUID());
      if (draft.status === 'succeeded') onReview(draft);
      else if (draft.status === 'failed') {
        setFailed(true);
        setError(
          draft.errorMessage
            ? { kind: 'provider', code: draft.errorCode, message: draft.errorMessage }
            : 'failed',
        );
      } else setPending(draft);
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 0) setRequestId(crypto.randomUUID());
      setFailed(caught instanceof ApiError && caught.status !== 0 && caught.status !== 400);
      setError(caught instanceof ApiError ? caught : 'start');
      void load();
    }
  }

  async function discard(draft: AiDraft) {
    setError(null);
    try {
      await api(`${base}/${draft.id}/discard`, { method: 'POST' });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'discard');
    }
  }

  const exhausted = overview?.enabled === true && overview.remainingToday === 0;

  return (
    <section className="card-panel ai-panel" aria-labelledby="ai-title">
      <p className="eyebrow">{t('recipeEditor.eyebrow')}</p>
      <h2 id="ai-title" tabIndex={-1} ref={heading}>
        {t('ai.title')}
      </h2>
      {overview === null && !error && <p role="status">{t('join.loading')}</p>}
      {overview?.enabled === false && <p>{t('ai.disabled')}</p>}
      {overview?.enabled && (
        <>
          <p className="muted">{t('ai.description')}</p>
          <form className="ai-form" onSubmit={submit}>
            <label className="field">
              <span>{t('ai.dishName')}</span>
              <input
                value={dishName}
                onChange={(event) => setDishName(event.target.value)}
                maxLength={80}
                required
                disabled={pending !== null}
                placeholder={t('ai.dishPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('ai.preferences')}</span>
              <textarea
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                maxLength={300}
                rows={2}
                disabled={pending !== null}
                placeholder={t('ai.preferencesPlaceholder')}
              />
            </label>
            <p className="muted" id="ai-privacy">
              {t('ai.privacy', {
                model: overview.model ?? '',
                remaining: overview.remainingToday,
                limit: overview.householdDailyLimit,
              })}
            </p>
            <div className="form-actions">
              <button
                className="primary-button"
                disabled={pending !== null || exhausted}
                aria-describedby="ai-privacy"
              >
                <Sparkles size={16} aria-hidden="true" />
                {t(pending ? 'ai.writing' : 'ai.write')}
              </button>
              <button type="button" className="text-button" onClick={onClose}>
                {t('ai.back')}
              </button>
            </div>
          </form>
        </>
      )}
      <p role="status" className={pending ? 'notice' : 'sr-only'}>
        {pending ? t('ai.pending', { name: pending.dishName }) : ''}
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>
            {error instanceof ApiError
              ? apiError(error)
              : typeof error === 'object'
                ? language === 'en'
                  ? error.message
                  : (errorCode(error.code) ?? t('ai.draftFailed'))
                : t(
                    error === 'load'
                      ? 'ai.loadFailed'
                      : error === 'failed'
                        ? 'ai.draftFailed'
                        : error === 'slow'
                          ? 'ai.slow'
                          : error === 'start'
                            ? 'ai.startFailed'
                            : 'ai.discardFailed',
                  )}
          </p>
        </div>
      )}
      {(failed || exhausted || overview?.enabled === false) && (
        <button type="button" className="text-button" onClick={onManual}>
          {t('ai.manual')}
        </button>
      )}
      {overview?.enabled === false && (
        <button type="button" className="text-button" onClick={onClose}>
          {t('ai.back')}
        </button>
      )}
      {overview && overview.drafts.some((draft) => draft.id !== pending?.id) && (
        <>
          <h3>{t('ai.unfinished')}</h3>
          <ul className="ai-drafts">
            {overview.drafts
              .filter((draft) => draft.id !== pending?.id)
              .map((draft) => (
                <li key={draft.id}>
                  <span>
                    <strong>{draft.dishName}</strong>
                    <span className="muted">
                      {' '}
                      ·{' '}
                      {t(
                        draft.status === 'succeeded'
                          ? 'ai.ready'
                          : draft.status === 'failed'
                            ? 'ai.failedState'
                            : 'ai.runningState',
                      )}
                      {t('ai.by', { name: draft.createdBy })}
                    </span>
                  </span>
                  <span className="ai-draft-actions">
                    {draft.status === 'succeeded' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onReview(draft)}
                        aria-label={t('ai.reviewLabel', { name: draft.dishName })}
                      >
                        {t('ai.review')}
                      </button>
                    )}
                    {draft.status !== 'running' && draft.status !== 'queued' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => discard(draft)}
                        aria-label={t('ai.discardLabel', { name: draft.dishName })}
                      >
                        {t('ai.discard')}
                      </button>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
