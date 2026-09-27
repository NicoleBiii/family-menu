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
import { api, authErrorMessages, setCsrfToken, signInUrl, type Session } from './api';
import { HouseholdPage } from './HouseholdPage';
import { JoinPage } from './JoinPage';
import { MenuPage } from './MenuPage';
import { OrdersPage } from './OrdersPage';
import { ShoppingPage } from './ShoppingPage';

const navigation = [
  { label: 'Menu', icon: Utensils },
  { label: 'Meals', icon: CalendarDays },
  { label: 'Shopping', icon: ShoppingBasket },
  { label: 'Household', icon: House },
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
function readAuthError() {
  const code = new URLSearchParams(window.location.search).get('authError');
  if (!code) return '';
  history.replaceState(null, '', window.location.pathname);
  return authErrorMessages[code] ?? 'Sign-in failed. Please try again.';
}
function storedActive() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const [page, setPageState] = useState<Page>(initialPage);
  const [session, setSession] = useState<Session | null>(null);
  const [activeId, setActiveId] = useState<string | null>(storedActive);
  const [authError, setAuthError] = useState(readAuthError);
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
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken('');
      await refreshSession();
    }
  }
  const activeHousehold = session?.authenticated
    ? session.households.find((household) => household.id === activeId)
    : undefined;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Family Menu home">
          <span className="brand-mark">
            <CookingPot size={24} />
          </span>
          family menu<span className="brand-dot">.</span>
        </a>
        <div className="account-bar">
          {session?.authenticated ? (
            <>
              <span className="preview-label" title={session.user.email ?? undefined}>
                <span /> {activeHousehold ? activeHousehold.name : session.user.displayName}
              </span>
              <button className="icon-button" aria-label="Sign out" onClick={signOut}>
                <LogOut size={18} />
              </button>
            </>
          ) : session?.signInAvailable ? (
            <a className="sign-in-link" href={signInUrl(window.location.pathname)}>
              <LogIn size={16} /> Sign in
            </a>
          ) : (
            <span className="preview-label">
              <span /> Sample household
            </span>
          )}
        </div>
      </header>
      {authError && (
        <div className="alert-banner" role="alert">
          <span>{authError}</span>
          <button className="text-button" onClick={() => setAuthError('')}>
            Dismiss
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
            <p className="eyebrow">YOUR SHARED TABLE</p>
            <h1>Household</h1>
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
                    <Leaf size={15} /> GOOD FOOD, SHARED DAILY
                  </p>
                  <h1 id="welcome-title">
                    A little planning.
                    <br />
                    <em>A lot of together.</em>
                  </h1>
                  <p className="hero-description">
                    Keep the recipes you love, decide what’s for dinner,
                    <br className="desktop-break" /> and make room for more time around the table.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      search.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      search.current?.focus({ preventScroll: true });
                    }}
                  >
                    Explore the menu <ArrowRight size={18} />
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
                  <div className="art-caption">made to be shared</div>
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
            <p className="eyebrow">YOUR SHARED TABLE</p>
            <h1>Meals</h1>
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
            <p className="eyebrow">YOUR SHARED TABLE</p>
            <h1>Shopping</h1>
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
          <p>A shared menu for the people you call home.</p>
          <span>
            Starter recipes are written for Family Menu · Virtual points have no cash value
          </span>
        </footer>
      </main>
      <nav className="main-nav" aria-label="Main navigation">
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            aria-current={page === label ? 'page' : undefined}
            onClick={() => {
              setPage(label);
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
