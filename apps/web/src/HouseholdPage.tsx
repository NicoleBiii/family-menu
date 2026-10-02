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
import { useI18n } from './i18n';

interface Props {
  session: Session | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}

export function HouseholdPage({ session, activeId, onSelect, onChanged }: Props) {
  const { t } = useI18n();
  if (!session) return <p role="status">{t('household.loadingYour')}</p>;
  if (!session.authenticated) {
    return (
      <div className="empty-state">
        <House size={36} />
        <h2>{t('household.welcome')}</h2>
        <p>{t('household.signInDescription')}</p>
        {session.signInAvailable ? (
          <a className="primary-button" href={signInUrl('/household')}>
            <LogIn size={18} /> {t('join.signInGoogle')}
          </a>
        ) : (
          <p className="sample-note">{t('join.notConfigured')}</p>
        )}
      </div>
    );
  }
  const households = session.households;
  return (
    <div className="household-layout">
      {households.length > 1 && (
        <label className="field">
          <span>{t('household.current')}</span>
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
          <h2>{t('household.start')}</h2>
          <p>{t('household.startDescription')}</p>
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
  const { t, apiError } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | 'create' | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const household = await api<HouseholdSummary>('/households', {
        method: 'POST',
        body: { name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      setName('');
      await onCreated(household);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'create');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card-panel" onSubmit={submit}>
      <h2>{compact ? t('household.createAnother') : t('household.create')}</h2>
      <label className="field">
        <span>{t('household.name')}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          placeholder={t('household.namePlaceholder')}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError ? apiError(error) : t('household.createFailed')}
        </p>
      )}
      <button className="primary-button" disabled={busy || !name.trim()}>
        {t('household.createButton')}
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
  const { language, t, apiError } = useI18n();
  const [detail, setDetail] = useState<HouseholdDetail | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ApiError | 'load' | 'action' | null>(null);

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
      setError(caught instanceof ApiError ? caught : 'load');
      if (caught instanceof ApiError && caught.status === 404) await onChanged();
    }
  }, [householdId, onChanged]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'action');
    }
  }

  if (!detail) {
    return error ? (
      <p className="form-error" role="alert">
        {error instanceof ApiError
          ? apiError(error)
          : t(error === 'load' ? 'household.loadFailed' : 'household.actionFailed')}
      </p>
    ) : (
      <p role="status">{t('household.loading')}</p>
    );
  }
  const isOwner = detail.role === 'owner';
  return (
    <>
      <section className="card-panel" aria-labelledby="household-name">
        <p className="eyebrow">{t('household.eyebrow')}</p>
        <h2 id="household-name">{detail.name}</h2>
        <p className="muted">
          {t('household.timezoneRole', {
            timezone: detail.timezone,
            role: t(isOwner ? 'household.ownerRole' : 'household.memberRole'),
          })}
        </p>
        <h3>
          <Users size={16} /> {t('household.members', { count: detail.members.length })}
        </h3>
        <ul className="member-list">
          {detail.members.map((member) => (
            <li key={member.userId}>
              <span>
                {member.displayName}
                {member.userId === userId && t('household.you')}
                {member.role === 'owner' && (
                  <span className="role-tag">{t('household.owner')}</span>
                )}
              </span>
              {isOwner && member.role !== 'owner' && (
                <button
                  className="icon-button small"
                  aria-label={t('household.remove', { name: member.displayName })}
                  onClick={() =>
                    run(async () => {
                      if (
                        !window.confirm(
                          t('household.removeConfirm', {
                            name: member.displayName,
                            household: detail.name,
                          }),
                        )
                      )
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
                if (!window.confirm(t('household.leaveConfirm', { name: detail.name }))) return;
                await api(`/households/${householdId}/members/${userId}`, { method: 'DELETE' });
                await onChanged();
              })
            }
          >
            {t('household.leave')}
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error instanceof ApiError
              ? apiError(error)
              : t(error === 'load' ? 'household.loadFailed' : 'household.actionFailed')}
          </p>
        )}
      </section>
      {isOwner && (
        <section className="card-panel" aria-labelledby="invite-title">
          <h2 id="invite-title">{t('household.invite')}</h2>
          <p className="muted">{t('household.inviteDescription')}</p>
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
            <Link2 size={18} /> {t('household.createLink')}
          </button>
          {newLink && (
            <div className="invite-link">
              <label className="field">
                <span>{t('household.newLink')}</span>
                <input readOnly value={newLink} onFocus={(event) => event.target.select()} />
              </label>
              <button
                className="icon-button"
                aria-label={t('household.copyLink')}
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
                {copied ? t('household.copied') : ''}
              </span>
            </div>
          )}
          {invitations.length > 0 && (
            <>
              <h3>{t('household.activeLinks', { count: invitations.length })}</h3>
              <ul className="member-list">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    <span>
                      {t('household.expires', {
                        date: new Date(invitation.expiresAt).toLocaleDateString(
                          language === 'zh' ? 'zh-CN' : 'en',
                        ),
                      })}
                    </span>
                    <button
                      className="icon-button small"
                      aria-label={t('household.revokeLink')}
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
