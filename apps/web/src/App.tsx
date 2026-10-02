import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  CookingPot,
  House,
  Leaf,
  LogIn,
  LogOut,
  ShoppingBasket,
  Utensils,
} from 'lucide-react';
import { api, SESSION_EXPIRED_EVENT, setCsrfToken, signInUrl, type Session } from './api';
import { HouseholdPage } from './HouseholdPage';
import { JoinPage } from './JoinPage';
import { MenuPage } from './MenuPage';
import { OrdersPage } from './OrdersPage';
import { ShoppingPage } from './ShoppingPage';
import { useI18n, type MessageKey } from './i18n';

const navigation = [
  { label: 'Menu', text: 'nav.menu', icon: Utensils },
  { label: 'Meals', text: 'nav.meals', icon: CalendarDays },
  { label: 'Shopping', text: 'nav.shopping', icon: ShoppingBasket },
  { label: 'Household', text: 'nav.household', icon: House },
] as const;
type Page = (typeof navigation)[number]['label'] | 'Join';
const ACTIVE_KEY = 'family-menu.active-household';

function initialPage(): Page {
  if (window.location.pathname === '/join') return 'Join';
  if (window.location.pathname === '/household') return 'Household';
  if (window.location.pathname === '/meals') return 'Meals';
  if (window.location.pathname === '/shopping') return 'Shopping';
  return 'Menu';
}
function readAuthError(): MessageKey | null {
  const code = new URLSearchParams(window.location.search).get('authError');
  if (!code) return null;
  history.replaceState(null, '', window.location.pathname);
  const messages: Record<string, MessageKey> = {
    state_invalid: 'app.authStateInvalid',
    provider_denied: 'app.authProviderDenied',
    exchange_failed: 'app.authExchangeFailed',
    not_configured: 'app.authNotConfigured',
  };
  return messages[code] ?? 'app.authFailed';
}
function storedActive() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const { language, setLanguage, t } = useI18n();
  const [page, setPageState] = useState<Page>(initialPage);
  const [session, setSession] = useState<Session | null>(null);
  const [activeId, setActiveId] = useState<string | null>(storedActive);
  const [authError, setAuthError] = useState(readAuthError);
  const signOutDialog = useRef<HTMLDialogElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const [orderPrefill, setOrderPrefill] = useState<{ recipeId: string; servings: number } | null>(
    null,
  );
  const clearPrefill = useCallback(() => setOrderPrefill(null), []);

  const refreshSession = useCallback(async () => {
    try {
      const next = await api<Session>('/auth/session');
      if (next.authenticated) {
        setCsrfToken(next.csrfToken);
        setActiveId((current) =>
          next.households.some((household) => household.id === current)
            ? current
            : (next.households[0]?.id ?? null),
        );
      }
      setSession(next);
    } catch {
      setSession({ authenticated: false, signInAvailable: false });
    }
  }, []);
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  useEffect(() => {
    const onExpired = () => {
      setAuthError('app.authExpired');
      void refreshSession();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [refreshSession]);
  useEffect(() => {
    const pageKey = navigation.find((item) => item.label === page)?.text ?? 'nav.household';
    document.title =
      page === 'Menu'
        ? t('app.titleHome')
        : t('app.titlePage', { page: page === 'Join' ? t('join.title') : t(pageKey) });
  }, [page, t]);
  useEffect(() => {
    const onPop = () => setPageState(initialPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      // Remembering the household is a convenience only.
    }
  }, [activeId]);

  function setPage(next: Page) {
    setPageState(next);
    const path =
      next === 'Household'
        ? '/household'
        : next === 'Join'
          ? '/join'
          : next === 'Meals'
            ? '/meals'
            : next === 'Shopping'
              ? '/shopping'
              : '/';
    if (window.location.pathname !== path) history.pushState(null, '', path);
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      signOutDialog.current?.close();
      setCsrfToken('');
      await refreshSession();
    } catch {
      setAuthError('app.signOutFailed');
    } finally {
      setSigningOut(false);
    }
  }
  const activeHousehold = session?.authenticated
    ? session.households.find((household) => household.id === activeId)
    : undefined;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('app.skip')}
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label={t('app.home')}>
          <span className="brand-mark">
            <CookingPot size={24} />
          </span>
          family menu<span className="brand-dot">.</span>
        </a>
        <div className="account-bar">
          <div className="language-switch" role="group" aria-label={t('app.language')}>
            <button
              type="button"
              aria-label={t('app.chinese')}
              aria-pressed={language === 'zh'}
              onClick={() => setLanguage('zh')}
            >
              中
            </button>
            <button
              type="button"
              aria-label={t('app.english')}
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              EN
            </button>
          </div>
          {session?.authenticated ? (
            <>
              <span className="preview-label" title={session.user.email ?? undefined}>
                <span /> {activeHousehold ? activeHousehold.name : session.user.displayName}
              </span>
              <button
                ref={signOutButton}
                className="icon-button"
                aria-label={t('app.signOut')}
                onClick={() => signOutDialog.current?.showModal()}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : session?.signInAvailable ? (
            <a className="sign-in-link" href={signInUrl(window.location.pathname)}>
              <LogIn size={16} /> {t('app.signIn')}
            </a>
          ) : (
            <span className="preview-label">
              <span /> {t('app.sample')}
            </span>
          )}
        </div>
      </header>
      <dialog
        ref={signOutDialog}
        aria-labelledby="sign-out-title"
        aria-describedby="sign-out-description"
        onClose={() => signOutButton.current?.focus()}
      >
        <h2 id="sign-out-title">{t('app.signOutQuestion')}</h2>
        <p id="sign-out-description">{t('app.signOutDescription')}</p>
        <div className="form-actions">
          <button
            className="text-button"
            disabled={signingOut}
            onClick={() => signOutDialog.current?.close()}
          >
            {t('app.staySignedIn')}
          </button>
          <button className="primary-button" disabled={signingOut} onClick={signOut}>
            {signingOut ? t('app.signingOut') : t('app.signOut')}
          </button>
        </div>
      </dialog>
      {authError && (
        <div className="alert-banner" role="alert">
          <span>{t(authError)}</span>
          <button className="text-button" onClick={() => setAuthError(null)}>
            {t('app.dismiss')}
          </button>
        </div>
      )}
      <main id="main">
        {page === 'Join' ? (
          <JoinPage
            session={session}
            onJoined={async (household) => {
              await refreshSession();
              setActiveId(household.id);
              setPage('Household');
            }}
          />
        ) : page === 'Household' ? (
          <section className="page-panel">
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('nav.household')}</h1>
            <HouseholdPage
              session={session}
              activeId={activeId}
              onSelect={setActiveId}
              onChanged={refreshSession}
            />
          </section>
        ) : page === 'Menu' ? (
          <MenuPage
            hero={
              <section className="hero" aria-labelledby="welcome-title">
                <div className="hero-copy">
                  <p className="eyebrow">
                    <Leaf size={15} /> {t('app.heroEyebrow')}
                  </p>
                  <h1 id="welcome-title">
                    {t('app.heroTitleFirst')}
                    <br />
                    <em>{t('app.heroTitleSecond')}</em>
                  </h1>
                  <p className="hero-description">
                    {t('app.heroDescriptionFirst')}
                    <br className="desktop-break" /> {t('app.heroDescriptionSecond')}
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      search.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      search.current?.focus({ preventScroll: true });
                    }}
                  >
                    {t('app.explore')} <ArrowRight size={18} />
                  </button>
                </div>
                <div className="table-art" aria-hidden="true">
                  <div className="cloth-line" />
                  <div className="plate">
                    <span className="art-leaf leaf-one" />
                    <span className="art-leaf leaf-two" />
                    <span className="art-tomato tomato-one" />
                    <span className="art-tomato tomato-two" />
                    <span className="art-lemon" />
                  </div>
                  <div className="art-caption">{t('app.artCaption')}</div>
                </div>
              </section>
            }
            session={session}
            household={activeHousehold}
            onGoHousehold={() => setPage('Household')}
            onOrder={(recipeId, servings) => {
              setOrderPrefill({ recipeId, servings });
              setPage('Meals');
              window.scrollTo({ top: 0 });
            }}
            searchRef={search}
          />
        ) : page === 'Meals' ? (
          <section className="page-panel">
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('nav.meals')}</h1>
            <OrdersPage
              session={session}
              household={activeHousehold}
              prefill={orderPrefill}
              onPrefillUsed={clearPrefill}
              onGoHousehold={() => setPage('Household')}
            />
          </section>
        ) : (
          <section className="page-panel">
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('nav.shopping')}</h1>
            <ShoppingPage
              session={session}
              household={activeHousehold}
              onGoMeals={() => setPage('Meals')}
              onGoHousehold={() => setPage('Household')}
            />
          </section>
        )}
        <footer className="page-footer">
          <ChefHat size={18} />
          <p>{t('app.footer')}</p>
          <span>{t('app.footerNote')}</span>
        </footer>
      </main>
      <nav className="main-nav" aria-label={t('nav.main')}>
        {navigation.map(({ label, text, icon: Icon }) => (
          <button
            key={label}
            aria-current={page === label ? 'page' : undefined}
            onClick={() => {
              setPage(label);
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon size={20} />
            <span>{t(text)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
