import { useEffect, useState } from 'react';
import { ArrowLeft, ShoppingBasket } from 'lucide-react';
import {
  api,
  ApiError,
  type HouseholdSummary,
  type MealOrderDetail,
  type RecipeSummary,
  type Session,
} from './api';
import type { BasketControls } from './basket';
import { OrderEditor } from './OrderEditor';
import { useI18n } from './i18n';

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  basket: BasketControls;
  onBack: () => void;
  onSaved: (order: MealOrderDetail) => void;
}

/** A separate confirmation page for an unsent household basket. */
export function CheckoutPage({ session, household, basket, onBack, onSaved }: Props) {
  const { t, apiError } = useI18n();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [removed, setRemoved] = useState(false);
  /** Only a basket that is empty on arrival shows the empty page; the editor handles later removals. */
  const [startedEmpty, setStartedEmpty] = useState(false);
  const [error, setError] = useState<ApiError | 'load' | null>(null);
  const householdId = household?.id;
  const { keepAvailable } = basket;

  useEffect(() => {
    let current = true;
    if (!householdId) return;
    setRecipes(null);
    setError(null);
    api<RecipeSummary[]>(`/households/${householdId}/recipes`)
      .then((next) => {
        if (!current) return;
        const active = next.filter((recipe) => !recipe.archived);
        // Remove archived dishes before the editor copies the basket into its form.
        if (keepAvailable(active)) setRemoved(true);
        setStartedEmpty(
          !basket.basket.items.some((item) => active.some((recipe) => recipe.id === item.recipeId)),
        );
        setRecipes(active);
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof ApiError ? caught : 'load');
      });
    return () => {
      current = false;
    };
    // The basket is checked once per load; its edits must not reload the menu.
  }, [householdId]);

  return (
    <section className="page-panel checkout-page">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> {t('basket.addMore')}
      </button>
      <p className="eyebrow">{t('basket.title')}</p>
      <h1>{t('checkout.title')}</h1>
      <p className="muted">{t('checkout.hint')}</p>
      {removed && (
        <p className="notice" role="status">
          {t('basket.unavailable')}
        </p>
      )}
      {!session ? (
        <p role="status">{t('join.loading')}</p>
      ) : !household || startedEmpty ? (
        <div className="empty-state">
          <ShoppingBasket size={30} aria-hidden="true" />
          <p>{t('basket.emptyCheckout')}</p>
        </div>
      ) : error ? (
        <p className="form-error" role="alert">
          {error instanceof ApiError ? apiError(error) : t('menu.loadFailed')}
        </p>
      ) : recipes === null ? (
        <p role="status">{t('menu.loading')}</p>
      ) : (
        <OrderEditor
          householdId={household.id}
          timezone={household.timezone}
          recipes={recipes}
          start={{ mode: 'basket' }}
          basket={basket}
          onCancel={onBack}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
