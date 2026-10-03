import { useState } from 'react';
import { Minus, Plus, Search, ShoppingBasket, Star, Trash2 } from 'lucide-react';
import { recipeImageUrl, type Category, type RecipeSummary } from './api';
import { MAX_BASKET_ITEMS, type BasketControls } from './basket';
import { useI18n } from './i18n';

interface Props {
  recipes: RecipeSummary[];
  categories: Category[];
  householdId: string;
  basket: BasketControls;
  onReview: () => void;
}

/** Home dish browser: a category rail, menu cards and a persistent order basket. */
export function DishBrowser({ recipes, categories, householdId, basket, onReview }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const items = basket.basket.items;
  const inBasket = new Map(items.map((item) => [item.recipeId, item.servings]));
  const needle = query.trim().toLocaleLowerCase();
  const visible = recipes.filter((recipe) => recipe.name.toLocaleLowerCase().includes(needle));
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
  const groupId = (id: string) => `dishes-${id || 'none'}`;

  return (
    <div className="dish-browser">
      <label className="search-field dish-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">{t('basket.search')}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('basket.search')}
        />
      </label>
      <div className="dish-menu-layout">
        <nav className="dish-categories" aria-label={t('home.categories')}>
          <span className="dish-rail-title" aria-hidden="true">
            {t('home.categories')}
          </span>
          {groups.map((group) => {
            // Servings already in the basket from this category, like the badges on food apps.
            const chosen = group.recipes.reduce(
              (sum, recipe) => sum + (inBasket.get(recipe.id) ?? 0),
              0,
            );
            return (
              <a
                key={group.id || 'none'}
                href={`#${groupId(group.id)}`}
                className={chosen > 0 ? 'has-chosen' : undefined}
              >
                {group.name}
                {chosen > 0 ? (
                  <>
                    <span className="rail-badge" aria-hidden="true">
                      {chosen}
                    </span>
                    <span className="sr-only">{t('basket.categoryCount', { count: chosen })}</span>
                  </>
                ) : (
                  <span aria-hidden="true">{group.recipes.length}</span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="dish-results">
          {groups.length === 0 && <p className="muted">{t('basket.noMatch')}</p>}
          {groups.map((group) => (
            <section
              key={group.id || 'none'}
              id={groupId(group.id)}
              aria-labelledby={`${groupId(group.id)}-title`}
            >
              <h3 className="dish-group" id={`${groupId(group.id)}-title`}>
                {group.name}
              </h3>
              <ul className="dish-list">
                {group.recipes.map((recipe) => {
                  const count = inBasket.get(recipe.id);
                  return (
                    <li key={recipe.id} className={count !== undefined ? 'in-basket' : undefined}>
                      <div className="dish-photo">
                        {count !== undefined && (
                          <span className="dish-badge" aria-hidden="true">
                            {count}
                          </span>
                        )}
                        {recipe.imageId ? (
                          <img
                            src={recipeImageUrl(householdId, recipe.id, recipe.imageId)}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span aria-hidden="true">{Array.from(recipe.name.trim())[0] ?? '?'}</span>
                        )}
                      </div>
                      <div className="dish-text">
                        <strong className="dish-name">{recipe.name}</strong>
                        {recipe.description && (
                          <span className="muted dish-description">{recipe.description}</span>
                        )}
                        <span className="dish-points">
                          <Star size={13} aria-hidden="true" />{' '}
                          {t('menu.pointsPerServing', { count: recipe.pricePoints })}
                        </span>
                        {count !== undefined && (
                          <span className="dish-chosen">{t('basket.inBasket', { count })}</span>
                        )}
                      </div>
                      {count === undefined ? (
                        <button
                          className="secondary-button dish-add"
                          aria-label={t('basket.addLabel', { name: recipe.name })}
                          disabled={full}
                          onClick={() => basket.add(recipe)}
                        >
                          <Plus size={17} aria-hidden="true" /> {t('basket.add')}
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
                          <span className="stepper-count">{count}</span>
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
        </div>
        {items.length > 0 && (
          <aside className="basket-bar" aria-label={t('basket.title')}>
            <div className="basket-summary" role="status">
              <span className="basket-icon">
                <ShoppingBasket size={20} aria-hidden="true" />
                <span className="basket-count">{servings}</span>
              </span>
              <span>
                <strong>{t('basket.title')}</strong>
                <span className="muted block">{summary}</span>
              </span>
            </div>
            <div className="basket-actions">
              <button
                className="text-button basket-clear"
                aria-label={t('basket.clear')}
                onClick={() => {
                  if (window.confirm(t('basket.clearConfirm'))) basket.clear();
                }}
              >
                <Trash2 size={17} aria-hidden="true" />
                <span className="basket-clear-text">{t('basket.clear')}</span>
              </button>
              <button className="primary-button" onClick={onReview}>
                {t('basket.review')}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
