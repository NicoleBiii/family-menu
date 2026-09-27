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
    const path = next === 'Household' ? '/household' : next === 'Join' ? '/join' : '/';
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
            searchRef={search}
          />
        ) : (
          <section className="page-panel">
            <p className="eyebrow">YOUR SHARED TABLE</p>
            <h1>{page}</h1>
            <div className="empty-state">
              {page === 'Meals' ? <CalendarDays size={36} /> : <ShoppingBasket size={36} />}
              <h2>
                {page === 'Meals'
                  ? 'Good meals start with a plan.'
                  : 'A clearer list. An easier shop.'}
              </h2>
              <p>
                {page === 'Meals'
                  ? 'Your household’s planned meals will live here.'
                  : 'Ingredients from your meal orders will come together here.'}
              </p>
              <p className="sample-note">
                Meal orders and shopping lists are not available yet. Households, invitations and
                recipes are.
              </p>
              <button className="primary-button" onClick={() => setPage('Menu')}>
                Browse the menu <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}
        <footer className="page-footer">
          <ChefHat size={18} />
          <p>A shared menu for the people you call home.</p>
          <span>Starter recipes are written for Family Menu · Meal orders are coming next</span>
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
