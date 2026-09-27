import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { api, ApiError, type AiDraft, type AiOverview } from './api';

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
  const [overview, setOverview] = useState<AiOverview | null>(null);
  const [dishName, setDishName] = useState('');
  const [preferences, setPreferences] = useState('');
  // Kept across a network failure so that retrying cannot start a second draft.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<AiDraft | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const base = `/households/${householdId}/ai-drafts`;

  const load = useCallback(async () => {
    try {
      setOverview(await api<AiOverview>(base));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load AI drafts.');
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
          setError(latest.errorMessage ?? 'The draft could not be written.');
          void load();
          return;
        }
      } catch {
        // A dropped connection is retried by the next poll; the draft keeps running on the server.
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setPending(null);
        setError(
          'This is taking longer than expected. The draft will appear below if it finishes.',
        );
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
    setError('');
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
        setError(draft.errorMessage ?? 'The draft could not be written.');
      } else setPending(draft);
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 0) setRequestId(crypto.randomUUID());
      setFailed(caught instanceof ApiError && caught.status !== 0 && caught.status !== 400);
      setError(caught instanceof ApiError ? caught.message : 'Could not start the draft.');
      void load();
    }
  }

  async function discard(draft: AiDraft) {
    setError('');
    try {
      await api(`${base}/${draft.id}/discard`, { method: 'POST' });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not discard the draft.');
    }
  }

  const exhausted = overview?.enabled === true && overview.remainingToday === 0;

  return (
    <section className="card-panel ai-panel" aria-labelledby="ai-title">
      <p className="eyebrow">YOUR HOUSEHOLD MENU</p>
      <h2 id="ai-title" tabIndex={-1} ref={heading}>
        Draft a recipe with AI
      </h2>
      {overview === null && !error && <p role="status">Loading…</p>}
      {overview?.enabled === false && (
        <p>AI drafts are turned off at the moment. You can still add recipes by hand.</p>
      )}
      {overview?.enabled && (
        <>
          <p className="muted">
            Name a dish and the AI writes a first draft of ingredients and steps. You review and
            edit it before anything is added to your menu. AI drafts can contain mistakes, so check
            amounts, cooking times and allergens yourself.
          </p>
          <form className="ai-form" onSubmit={submit}>
            <label className="field">
              <span>Dish name</span>
              <input
                value={dishName}
                onChange={(event) => setDishName(event.target.value)}
                maxLength={80}
                required
                disabled={pending !== null}
                placeholder="e.g. Mapo tofu"
              />
            </label>
            <label className="field">
              <span>Preferences (optional)</span>
              <textarea
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                maxLength={300}
                rows={2}
                disabled={pending !== null}
                placeholder="e.g. mild, no peanuts, for four"
              />
            </label>
            <p className="muted" id="ai-privacy">
              Only the dish name and preferences are sent to the AI service ({overview.model}).{' '}
              {overview.remainingToday} of {overview.householdDailyLimit} household drafts left in
              the last 24 hours.
            </p>
            <div className="form-actions">
              <button
                className="primary-button"
                disabled={pending !== null || exhausted}
                aria-describedby="ai-privacy"
              >
                <Sparkles size={16} aria-hidden="true" />
                {pending ? 'Writing…' : 'Write a draft'}
              </button>
              <button type="button" className="text-button" onClick={onClose}>
                Back to menu
              </button>
            </div>
          </form>
        </>
      )}
      <p role="status" className={pending ? 'notice' : 'sr-only'}>
        {pending
          ? `Writing a draft for ${pending.dishName}… this usually takes a few seconds.`
          : ''}
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {(failed || exhausted || overview?.enabled === false) && (
        <button type="button" className="text-button" onClick={onManual}>
          Enter the recipe by hand instead
        </button>
      )}
      {overview?.enabled === false && (
        <button type="button" className="text-button" onClick={onClose}>
          Back to menu
        </button>
      )}
      {overview && overview.drafts.some((draft) => draft.id !== pending?.id) && (
        <>
          <h3>Unfinished drafts</h3>
          <ul className="ai-drafts">
            {overview.drafts
              .filter((draft) => draft.id !== pending?.id)
              .map((draft) => (
                <li key={draft.id}>
                  <span>
                    <strong>{draft.dishName}</strong>
                    <span className="muted">
                      {' '}
                      · {draftState(draft)} · by {draft.createdBy}
                    </span>
                  </span>
                  <span className="ai-draft-actions">
                    {draft.status === 'succeeded' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onReview(draft)}
                        aria-label={`Review draft for ${draft.dishName}`}
                      >
                        Review
                      </button>
                    )}
                    {draft.status !== 'running' && draft.status !== 'queued' && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => discard(draft)}
                        aria-label={`Discard draft for ${draft.dishName}`}
                      >
                        Discard
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

function draftState(draft: AiDraft) {
  if (draft.status === 'succeeded') return 'ready to review';
  if (draft.status === 'failed') return 'failed';
  return 'being written';
}
