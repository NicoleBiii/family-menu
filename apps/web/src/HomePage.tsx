import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Leaf, LogIn } from 'lucide-react';
import {
  api,
  ApiError,
  signInUrl,
  type Category,
  type HouseholdSummary,
  type RecipeSummary,
  type Session,
} from './api';
import type { BasketControls } from './basket';
import { DishBrowser } from './DishBrowser';
import { useI18n } from './i18n';

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  basket: BasketControls;
  /** Name of a dish just added from the Recipes dialog, to confirm once. */
  added: string | null;
  onManage: () => void;
  onGoHousehold: () => void;
  onCheckout: () => void;
}

/** The household menu is the home screen; editing lives at /recipes. */
export function HomePage({
  session,
  household,
  basket,
  added,
  onManage,
  onGoHousehold,
  onCheckout,
}: Props) {
  const { t, apiError } = useI18n();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<ApiError | 'load' | null>(null);
  const [removed, setRemoved] = useState(false);
  /** The household the loaded recipes belong to; a switch must not prune the new basket. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const householdId = household?.id;
  const { keepAvailable } = basket;

  useEffect(() => {
    let current = true;
    if (!householdId) return;
    setRecipes(null);
    setError(null);
    setRemoved(false);
    Promise.all([
      api<RecipeSummary[]>(`/households/${householdId}/recipes`),
      api<Category[]>(`/households/${householdId}/categories`),
    ])
      .then(([nextRecipes, nextCategories]) => {
        if (!current) return;
        setRecipes(nextRecipes.filter((recipe) => !recipe.archived));
        setCategories(nextCategories);
        setLoadedFor(householdId);
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof ApiError ? caught : 'load');
      });
    return () => {
      current = false;
    };
  }, [householdId]);
  // Dishes archived since they were added cannot be ordered; take them out and say so.
  useEffect(() => {
    if (recipes && loadedFor === householdId && keepAvailable(recipes)) setRemoved(true);
  }, [recipes, loadedFor, householdId, keepAvailable]);

  return (
    <>
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
          <a className="primary-button" href="#order-menu">
            {t('app.explore')} <ArrowRight size={18} />
          </a>
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

      <section className="menu-section home-menu" id="order-menu" aria-labelledby="home-menu-title">
        <div className="section-heading home-menu-heading">
          <div>
            <p className="eyebrow">{household ? household.name : t('menu.eyebrow')}</p>
            <h2 id="home-menu-title">{t('menu.yours')}</h2>
            <p className="muted">{t('home.orderHint')}</p>
          </div>
          <button className="manage-button" onClick={onManage}>
            <span className="manage-icon" aria-hidden="true">
              <BookOpen size={20} />
            </span>
            <span className="manage-text">
              <strong>{t('home.manageRecipes')}</strong>
              <span>{t('home.manageHint')}</span>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        {!session ? (
          <p role="status">{t('join.loading')}</p>
        ) : !session.authenticated || !household ? (
          <div className="empty-state">
            <BookOpen size={30} aria-hidden="true" />
            <h3>{t('orders.welcome')}</h3>
            <p>{t(session.authenticated ? 'orders.needHousehold' : 'orders.signInPrompt')}</p>
            {session.authenticated ? (
              <button className="primary-button" onClick={onGoHousehold}>
                {t('menu.goHousehold')}
              </button>
            ) : session.signInAvailable ? (
              <a className="primary-button" href={signInUrl('/')}>
                <LogIn size={18} /> {t('join.signInGoogle')}
              </a>
            ) : null}
          </div>
        ) : error ? (
          <p className="form-error" role="alert">
            {error instanceof ApiError ? apiError(error) : t('menu.loadFailed')}
          </p>
        ) : recipes === null ? (
          <p role="status">{t('menu.loading')}</p>
        ) : recipes.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={30} aria-hidden="true" />
            <h3>{t('menu.empty')}</h3>
            <p>{t('menu.emptyHint')}</p>
            <button className="primary-button" onClick={onManage}>
              {t('home.addFirst')}
            </button>
          </div>
        ) : (
          <>
            {(removed || added) && (
              <p className="notice" role="status">
                {removed ? t('basket.unavailable') : t('basket.addedNotice', { name: added! })}
              </p>
            )}
            <DishBrowser
              recipes={recipes}
              categories={categories}
              householdId={household.id}
              basket={basket}
              onReview={onCheckout}
            />
          </>
        )}
      </section>
    </>
  );
}
