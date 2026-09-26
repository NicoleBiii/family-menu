import { useEffect, useState } from 'react';
import { LogIn, Users } from 'lucide-react';
import { api, ApiError, signInUrl, type HouseholdSummary, type Session } from './api';

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
  const [token] = useState(readToken);
  const [preview, setPreview] = useState<{ householdName: string; alreadyMember: boolean } | null>(
    null,
  );
  const [error, setError] = useState('');
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
        setError(
          caught instanceof ApiError ? caught.message : 'This invitation could not be opened.',
        );
      });
  }, [token, signedIn]);

  async function join() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const household = await api<HouseholdSummary>('/invitations/accept', {
        method: 'POST',
        body: { token },
      });
      forgetToken();
      await onJoined(household);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not join the household.');
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (!token) {
    content = <p>This invitation link is incomplete. Ask for a new link.</p>;
  } else if (!session) {
    content = <p role="status">Loading…</p>;
  } else if (!session.authenticated) {
    content = session.signInAvailable ? (
      <>
        <p>Sign in to see which household invited you.</p>
        <a className="primary-button" href={signInUrl('/join')}>
          <LogIn size={18} /> Sign in with Google
        </a>
      </>
    ) : (
      <p className="sample-note">Sign-in is not configured on this server yet.</p>
    );
  } else if (error) {
    content = null;
  } else if (!preview) {
    content = <p role="status">Checking your invitation…</p>;
  } else {
    content = (
      <>
        <h2>{preview.householdName}</h2>
        <p>
          {preview.alreadyMember
            ? 'You are already a member of this household.'
            : 'You have been invited to share this household’s menu and meal orders.'}
        </p>
        <button className="primary-button" disabled={busy} onClick={join}>
          {preview.alreadyMember ? 'Open household' : 'Join household'}
        </button>
      </>
    );
  }
  return (
    <section className="page-panel">
      <p className="eyebrow">INVITATION</p>
      <h1>Join a household</h1>
      <div className="empty-state">
        <Users size={36} />
        {content}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
