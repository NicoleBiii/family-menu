import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, House, Link2, LogIn, Trash2, UserMinus, Users } from 'lucide-react';
import {
  api,
  ApiError,
  signInUrl,
  type HouseholdDetail,
  type HouseholdSummary,
  type Invitation,
  type Session,
} from './api';

interface Props {
  session: Session | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}

export function HouseholdPage({ session, activeId, onSelect, onChanged }: Props) {
  if (!session) return <p role="status">Loading your household…</p>;
  if (!session.authenticated) {
    return (
      <div className="empty-state">
        <House size={36} />
        <h2>A place for your favourite people.</h2>
        <p>Sign in to create a household, invite the people you cook for, and share one menu.</p>
        {session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/household')}>
            <LogIn size={18} /> Sign in with Google
          </a>
        ) : (
          <p className="sample-note">Sign-in is not configured on this server yet.</p>
        )}
      </div>
    );
  }
  const households = session.households;
  return (
    <div className="household-layout">
      {households.length > 1 && (
        <label className="field">
          <span>Current household</span>
          <select value={activeId ?? ''} onChange={(event) => onSelect(event.target.value)}>
            {households.map((household) => (
              <option key={household.id} value={household.id}>
                {household.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {activeId ? (
        <HouseholdPanel
          key={activeId}
          householdId={activeId}
          userId={session.user.id}
          onChanged={onChanged}
        />
      ) : (
        <div className="empty-state">
          <House size={36} />
          <h2>Start your household</h2>
          <p>
            Create one for your home, or open an invitation link from someone who already has one.
          </p>
        </div>
      )}
      <CreateHousehold
        compact={households.length > 0}
        onCreated={async (household) => {
          await onChanged();
          onSelect(household.id);
        }}
      />
    </div>
  );
}

function CreateHousehold({
  compact,
  onCreated,
}: {
  compact: boolean;
  onCreated: (household: HouseholdSummary) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const household = await api<HouseholdSummary>('/households', {
        method: 'POST',
        body: { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      setName('');
      await onCreated(household);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the household.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card-panel" onSubmit={submit}>
      <h2>{compact ? 'Create another household' : 'Create a household'}</h2>
      <label className="field">
        <span>Household name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          placeholder="e.g. The Wang family"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy || !name.trim()}>
        Create household
      </button>
    </form>
  );
}

function HouseholdPanel({
  householdId,
  userId,
  onChanged,
}: {
  householdId: string;
  userId: string;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const household = await api<HouseholdDetail>(`/households/${householdId}`);
      setDetail(household);
      setInvitations(
        household.role === 'owner'
          ? await api<Invitation[]>(`/households/${householdId}/invitations`)
          : [],
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the household.');
      if (caught instanceof ApiError && caught.status === 404) await onChanged();
    }
  }, [householdId, onChanged]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }

  if (!detail) {
    return error ? (
      <p className="form-error" role="alert">
        {error}
      </p>
    ) : (
      <p role="status">Loading household…</p>
    );
  }
  const isOwner = detail.role === 'owner';
  return (
    <>
      <section className="card-panel" aria-labelledby="household-name">
        <p className="eyebrow">YOUR HOUSEHOLD</p>
        <h2 id="household-name">{detail.name}</h2>
        <p className="muted">
          Time zone: {detail.timezone} · You are {isOwner ? 'the owner' : 'a member'}
        </p>
        <h3>
          <Users size={16} /> Members ({detail.members.length})
        </h3>
        <ul className="member-list">
          {detail.members.map((member) => (
            <li key={member.userId}>
              <span>
                {member.displayName}
                {member.userId === userId && ' (you)'}
                {member.role === 'owner' && <span className="role-tag">Owner</span>}
              </span>
              {isOwner && member.role !== 'owner' && (
                <button
                  className="icon-button small"
                  aria-label={`Remove ${member.displayName}`}
                  onClick={() =>
                    run(async () => {
                      if (!window.confirm(`Remove ${member.displayName} from ${detail.name}?`))
                        return;
                      await api(`/households/${householdId}/members/${member.userId}`, {
                        method: 'DELETE',
                      });
                      await load();
                    })
                  }
                >
                  <UserMinus size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && (
          <button
            className="text-button"
            onClick={() =>
              run(async () => {
                if (!window.confirm(`Leave ${detail.name}?`)) return;
                await api(`/households/${householdId}/members/${userId}`, { method: 'DELETE' });
                await onChanged();
              })
            }
          >
            Leave household
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {isOwner && (
        <section className="card-panel" aria-labelledby="invite-title">
          <h2 id="invite-title">Invite someone</h2>
          <p className="muted">
            Each link works once and expires in 7 days. Anyone who joins can edit the shared menu
            and household orders.
          </p>
          <button
            className="primary-button"
            onClick={() =>
              run(async () => {
                const created = await api<{ url: string }>(
                  `/households/${householdId}/invitations`,
                  { method: 'POST' },
                );
                setNewLink(created.url);
                setCopied(false);
                await load();
              })
            }
          >
            <Link2 size={18} /> Create invitation link
          </button>
          {newLink && (
            <div className="invite-link">
              <label className="field">
                <span>New invitation link (shown once)</span>
                <input readOnly value={newLink} onFocus={(event) => event.target.select()} />
              </label>
              <button
                className="icon-button"
                aria-label="Copy invitation link"
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(newLink);
                    setCopied(true);
                  })
                }
              >
                <Copy size={18} />
              </button>
              <span role="status" className="muted">
                {copied ? 'Copied.' : ''}
              </span>
            </div>
          )}
          {invitations.length > 0 && (
            <>
              <h3>Active links ({invitations.length})</h3>
              <ul className="member-list">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                    <button
                      className="icon-button small"
                      aria-label="Revoke invitation link"
                      onClick={() =>
                        run(async () => {
                          await api(`/households/${householdId}/invitations/${invitation.id}`, {
                            method: 'DELETE',
                          });
                          await load();
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
