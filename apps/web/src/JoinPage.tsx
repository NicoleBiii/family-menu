import { useEffect, useState } from 'react';
import { LogIn, Users } from 'lucide-react';
import { api, ApiError, signInUrl, type HouseholdSummary, type Session } from './api';
import { useI18n } from './i18n';

const STORAGE_KEY = 'family-menu.pending-invitation';

/** The token arrives in the URL fragment; keep it across the sign-in redirect, then forget it. */
function readToken(): string | null {
  const fromHash = window.location.hash.slice(1);
  try {
    if (fromHash) {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
      history.replaceState(null, '', '/join');
      return fromHash;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return fromHash || null;
  }
}
function forgetToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable; nothing to clean up.
  }
}

interface Props {
  session: Session | null;
  onJoined: (household: HouseholdSummary) => Promise<void>;
}

export function JoinPage({ session, onJoined }: Props) {
  const { t, apiError } = useI18n();
  const [token] = useState(readToken);
  const [preview, setPreview] = useState<{ householdName: string; alreadyMember: boolean } | null>(
    null,
  );
  const [error, setError] = useState<ApiError | 'open' | 'join' | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = session?.authenticated === true;

  useEffect(() => {
    if (!token || !signedIn) return;
    api<{ householdName: string; alreadyMember: boolean }>('/invitations/preview', {
      method: 'POST',
      body: { token },
    })
      .then(setPreview)
      .catch((caught: unknown) => {
        forgetToken();
        setError(caught instanceof ApiError ? caught : 'open');
      });
  }, [token, signedIn]);

  async function join() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const household = await api<HouseholdSummary>('/invitations/accept', {
        method: 'POST',
        body: { token },
      });
      forgetToken();
      await onJoined(household);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'join');
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (!token) {
    content = <p>{t('join.incomplete')}</p>;
  } else if (!session) {
    content = <p role="status">{t('join.loading')}</p>;
  } else if (!session.authenticated) {
    content = session.signInAvailable ? (
      <>
        <p>{t('join.signInToSee')}</p>
        <a className="primary-button" href={signInUrl('/join')}>
          <LogIn size={18} /> {t('join.signInGoogle')}
        </a>
      </>
    ) : (
      <p className="sample-note">{t('join.notConfigured')}</p>
    );
  } else if (error) {
    content = null;
  } else if (!preview) {
    content = <p role="status">{t('join.checking')}</p>;
  } else {
    content = (
      <>
        <h2>{preview.householdName}</h2>
        <p>{preview.alreadyMember ? t('join.alreadyMember') : t('join.invited')}</p>
        <button className="primary-button" disabled={busy} onClick={join}>
          {preview.alreadyMember ? t('join.open') : t('join.join')}
        </button>
      </>
    );
  }
  return (
    <section className="page-panel">
      <p className="eyebrow">{t('join.eyebrow')}</p>
      <h1>{t('join.title')}</h1>
      <div className="empty-state">
        <Users size={36} />
        {content}
        {error && (
          <p className="form-error" role="alert">
            {error instanceof ApiError
              ? apiError(error)
              : t(error === 'open' ? 'join.openFailed' : 'join.joinFailed')}
          </p>
        )}
      </div>
    </section>
  );
}
