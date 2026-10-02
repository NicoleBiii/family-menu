import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  ChefHat,
  CookingPot,
  House,
  LogIn,
  LogOut,
  ShoppingBasket,
  Utensils,
} from 'lucide-react';
import {
  api,
  SESSION_EXPIRED_EVENT,
  setCsrfToken,
  signInUrl,
  type MealOrderDetail,
  type Session,
} from './api';
import { CheckoutPage } from './CheckoutPage';
import { HomePage } from './HomePage';
import { HouseholdPage } from './HouseholdPage';
import { JoinPage } from './JoinPage';
import { MenuPage } from './MenuPage';
import { OrdersPage } from './OrdersPage';
import { ShoppingPage } from './ShoppingPage';
import { clearStoredBaskets, useBasket } from './basket';
import { useI18n, type MessageKey } from './i18n';

const navigation = [
  { label: 'Home', text: 'nav.home', icon: Utensils },
  { label: 'Meals', text: 'nav.meals', icon: CalendarDays },
  { label: 'Shopping', text: 'nav.shopping', icon: ShoppingBasket },
  { label: 'Household', text: 'nav.household', icon: House },
] as const;
type Page = (typeof navigation)[number]['label'] | 'Recipes' | 'Checkout' | 'Join';
/** Pages reached from Home; its tab stays marked while they are open. */
const homeSection: Page[] = ['Home', 'Recipes', 'Checkout'];
const ACTIVE_KEY = 'family-menu.active-household';

function initialPage(): Page {
  if (window.location.pathname === '/join') return 'Join';
  if (window.location.pathname === '/household') return 'Household';
  if (window.location.pathname === '/meals') return 'Meals';
  if (window.location.pathname === '/shopping') return 'Shopping';
  if (window.location.pathname === '/recipes') return 'Recipes';
  if (window.location.pathname === '/checkout') return 'Checkout';
  return 'Home';
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
  const [placedOrder, setPlacedOrder] = useState<MealOrderDetail | null>(null);
  /** A dish just added from the Recipes dialog, confirmed once on Home. */
  const [addedToBasket, setAddedToBasket] = useState<string | null>(null);

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
    const pageKey = navigation.find((item) => item.label === page)?.text;
    document.title =
      page === 'Home'
        ? t('app.titleHome')
        : t('app.titlePage', {
            page:
              page === 'Join'
                ? t('join.title')
                : page === 'Recipes'
                  ? t('nav.menu')
                  : page === 'Checkout'
                    ? t('checkout.title')
                    : t(pageKey!),
          });
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
    setAddedToBasket(null);
    const path =
      next === 'Household'
        ? '/household'
        : next === 'Join'
          ? '/join'
          : next === 'Recipes'
            ? '/recipes'
            : next === 'Checkout'
              ? '/checkout'
              : next === 'Meals'
                ? '/meals'
                : next === 'Shopping'
                  ? '/shopping'
                  : '/';
    if (window.location.pathname !== path) history.pushState({ inApp: true }, '', path);
  }
  /** Returns to the previous in-app page, or to ordering when the page was opened directly. */
  function goBack() {
    if ((history.state as { inApp?: boolean } | null)?.inApp) history.back();
    else goOrdering();
  }
  /** Home, scrolled to the dish browser. */
  function goOrdering() {
    setPage('Home');
    requestAnimationFrame(() => document.getElementById('order-menu')?.scrollIntoView());
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      signOutDialog.current?.close();
      setCsrfToken('');
      clearStoredBaskets();
      basket.clear();
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
  const basket = useBasket(activeHousehold?.id);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('app.skip')}
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          aria-label={t('app.home')}
          onClick={(event) => {
            // Stay in the app (keeping unsaved page state) unless a new tab or window is wanted.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            setPage('Home');
            window.scrollTo({ top: 0 });
          }}
        >
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
        ) : page === 'Recipes' ? (
          <div className="page-panel">
            <button className="text-button back-button" onClick={goBack}>
              <ArrowLeft size={17} aria-hidden="true" /> {t('app.back')}
            </button>
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('home.manageRecipes')}</h1>
            <MenuPage
              hero={null}
              session={session}
              household={activeHousehold}
              onGoHousehold={() => setPage('Household')}
              onOrder={(recipe) => {
                basket.add(recipe);
                goOrdering();
                setAddedToBasket(recipe.name);
              }}
              searchRef={search}
            />
          </div>
        ) : page === 'Checkout' ? (
          <CheckoutPage
            session={session}
            household={activeHousehold}
            basket={basket}
            onBack={goOrdering}
            onSaved={(order) => {
              basket.clear();
              setPlacedOrder(order);
              setPage('Meals');
              window.scrollTo({ top: 0 });
            }}
          />
        ) : page === 'Meals' ? (
          <section className="page-panel">
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('nav.meals')}</h1>
            <OrdersPage
              session={session}
              household={activeHousehold}
              placed={placedOrder}
              onPlacedShown={() => setPlacedOrder(null)}
              onGoHousehold={() => setPage('Household')}
            />
          </section>
        ) : page === 'Shopping' ? (
          <section className="page-panel">
            <p className="eyebrow">{t('app.sharedTable')}</p>
            <h1>{t('nav.shopping')}</h1>
            <ShoppingPage
              session={session}
              household={activeHousehold}
              onGoMeals={goOrdering}
              onGoHousehold={() => setPage('Household')}
            />
          </section>
        ) : (
          <HomePage
            session={session}
            household={activeHousehold}
            basket={basket}
            added={addedToBasket}
            onManage={() => {
              setPage('Recipes');
              window.scrollTo({ top: 0 });
            }}
            onGoHousehold={() => setPage('Household')}
            onCheckout={() => {
              setPage('Checkout');
              window.scrollTo({ top: 0 });
            }}
          />
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
            aria-current={
              page === label
                ? 'page'
                : label === 'Home' && homeSection.includes(page)
                  ? 'true'
                  : undefined
            }
            onClick={() => {
              // The Home tab opens the dishes; the brand link opens the top of Home.
              if (label === 'Home') return goOrdering();
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
