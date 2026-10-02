import { useState } from 'react';
import { Minus, Plus, Search, ShoppingBasket, Star } from 'lucide-react';
import type { Category, RecipeSummary } from './api';
import { MAX_BASKET_ITEMS, type BasketControls } from './basket';
import { useI18n } from './i18n';

interface Props {
  recipes: RecipeSummary[];
  categories: Category[];
  basket: BasketControls;
  onReview: () => void;
}

/**
 * Meals entry point (UX-002 proposal §2): the household's active dishes by category, each with
 * an Add action, and a basket summary that leads to one Place order action.
 */
export function DishBrowser({ recipes, categories, basket, onReview }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  /** 'all', '' for Uncategorised, or a category id. */
  const [filter, setFilter] = useState('all');
  const items = basket.basket.items;
  const inBasket = new Map(items.map((item) => [item.recipeId, item.servings]));
  const needle = query.trim().toLowerCase();
  const knownFilter =
    filter === 'all' || filter === '' || categories.some((category) => category.id === filter)
      ? filter
      : 'all';
  const visible = recipes.filter(
    (recipe) =>
      recipe.name.toLowerCase().includes(needle) &&
      (knownFilter === 'all' || (recipe.categoryId ?? '') === knownFilter),
  );
  // Group by category in the household's category order, Uncategorised last.
  const groups = [
    ...categories.map((category) => ({ id: category.id, name: category.name })),
    { id: '', name: t('category.uncategorised') },
  ]
    .map((group) => ({
      ...group,
      recipes: visible.filter((recipe) => (recipe.categoryId ?? '') === group.id),
    }))
    .filter((group) => group.recipes.length > 0);
  const servings = items.reduce((sum, item) => sum + item.servings, 0);
  const points = items.reduce(
    (sum, item) =>
      sum +
      item.servings * (recipes.find((recipe) => recipe.id === item.recipeId)?.pricePoints ?? 0),
    0,
  );
  const summary = [
    items.length === 1 ? t('basket.oneDish') : t('basket.dishes', { count: items.length }),
    servings === 1 ? t('orders.oneServing') : t('orders.servings', { count: servings }),
    t('orders.points', { count: points }),
  ].join(' · ');
  const full = items.length >= MAX_BASKET_ITEMS;

  if (recipes.length === 0) {
    return <p className="muted">{t('orderEditor.noRecipes')}</p>;
  }

  return (
    <div className="dish-browser">
      <p className="muted">{t('basket.hint')}</p>
      <label className="search-field">
        <Search size={19} />
        <span className="sr-only">{t('basket.search')}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('basket.search')}
        />
      </label>
      {categories.length > 0 && (
        <div className="category-chips" role="group" aria-label={t('category.filter')}>
          {[
            { id: 'all', name: t('category.all') },
            ...categories,
            { id: '', name: t('category.uncategorised') },
          ].map((option) => (
            <button
              key={option.id || 'none'}
              className="category-chip"
              aria-pressed={knownFilter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
      {groups.length === 0 && <p className="muted">{t('basket.noMatch')}</p>}
      {groups.map((group) => (
        <section key={group.id || 'none'} aria-labelledby={`dishes-${group.id || 'none'}`}>
          <h2 className="dish-group" id={`dishes-${group.id || 'none'}`}>
            {group.name}
          </h2>
          <ul className="dish-list">
            {group.recipes.map((recipe) => {
              const count = inBasket.get(recipe.id);
              return (
                <li key={recipe.id}>
                  <span className="dish-text">
                    <span className="dish-name">{recipe.name}</span>
                    <span className="muted">
                      <Star size={12} aria-hidden="true" />{' '}
                      {t('menu.pointsPerServing', { count: recipe.pricePoints })}
                    </span>
                  </span>
                  {count === undefined ? (
                    <button
                      className="secondary-button"
                      aria-label={t('basket.addLabel', { name: recipe.name })}
                      disabled={full}
                      onClick={() => basket.add(recipe)}
                    >
                      <Plus size={16} aria-hidden="true" /> {t('basket.add')}
                    </button>
                  ) : (
                    <span className="stepper">
                      <button
                        className="icon-button small"
                        aria-label={t('basket.less', { name: recipe.name })}
                        onClick={() => basket.setServings(recipe.id, count - 1)}
                      >
                        <Minus size={16} />
                      </button>
                      <span className="stepper-count">
                        {count === 1 ? t('orders.oneServing') : t('orders.servings', { count })}
                      </span>
                      <button
                        className="icon-button small"
                        aria-label={t('basket.more', { name: recipe.name })}
                        disabled={count >= 100}
                        onClick={() => basket.add(recipe)}
                      >
                        <Plus size={16} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="sr-only" role="status">
        {items.length > 0 ? `${t('basket.title')}: ${summary}` : ''}
      </p>
      {items.length > 0 && (
        <div className="basket-bar">
          <span>
            <ShoppingBasket size={18} aria-hidden="true" /> <strong>{t('basket.title')}</strong>
            <br />
            <span className="muted">{summary}</span>
          </span>
          <span className="basket-actions">
            <button
              className="text-button"
              onClick={() => {
                if (window.confirm(t('basket.clearConfirm'))) basket.clear();
              }}
            >
              {t('basket.clear')}
            </button>
            <button className="primary-button" onClick={onReview}>
              {t('basket.review')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
