import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Clock3,
  CookingPot,
  House,
  Leaf,
  Search,
  ShoppingBasket,
  Users,
  Utensils,
  X,
} from 'lucide-react';

const recipes = [
  {
    id: 'chicken',
    name: 'Lemon herb chicken',
    category: 'Comfort food',
    minutes: 35,
    servings: 2,
    emoji: '🍋',
    tone: 'lemon',
    subtitle: 'Bright, simple, and made for sharing.',
    ingredients: [
      '300 g chicken breast',
      '1 lemon',
      '1 tbsp olive oil',
      'Rosemary and salt, to taste',
    ],
  },
  {
    id: 'noodles',
    name: 'Sesame noodle bowl',
    category: 'Quick meals',
    minutes: 20,
    servings: 2,
    emoji: '🍜',
    tone: 'sesame',
    subtitle: 'A little crunch. A lot of comfort.',
    ingredients: ['200 g noodles', '1 cucumber', '2 tbsp sesame paste', '1 tbsp soy sauce'],
  },
  {
    id: 'tomato',
    name: 'Tomato & egg stir-fry',
    category: 'Quick meals',
    minutes: 15,
    servings: 2,
    emoji: '🍅',
    tone: 'tomato',
    subtitle: 'The familiar favourite everyone asks for.',
    ingredients: ['3 eggs', '2 tomatoes', '1 tsp cooking oil', 'Salt, to taste'],
  },
  {
    id: 'greens',
    name: 'Roasted vegetable bowl',
    category: 'Plant-forward',
    minutes: 30,
    servings: 2,
    emoji: '🥦',
    tone: 'greens',
    subtitle: 'Colourful vegetables, one happy table.',
    ingredients: ['300 g broccoli', '200 g sweet potato', '1 tbsp olive oil', 'Pepper, to taste'],
  },
] as const;
type Recipe = (typeof recipes)[number];
const navigation = [
  { label: 'Menu', icon: Utensils },
  { label: 'Meals', icon: CalendarDays },
  { label: 'Shopping', icon: ShoppingBasket },
  { label: 'Household', icon: House },
] as const;
type Page = (typeof navigation)[number]['label'];

export function App() {
  const [page, setPage] = useState<Page>('Menu');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All recipes');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const visible = recipes.filter(
    (recipe) =>
      (category === 'All recipes' || recipe.category === category) &&
      recipe.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function closeRecipe() {
    dialog.current?.close();
    setSelected(null);
    opener.current?.focus();
  }

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
        <span className="preview-label">
          <span /> Sample household
        </span>
      </header>
      <main id="main">
        {page === 'Menu' ? (
          <>
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
            <section className="menu-section" aria-labelledby="menu-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SOMETHING FOR EVERYONE</p>
                  <h2 id="menu-title">Your next favourite meal</h2>
                </div>
                <span className="recipe-count">{recipes.length} sample recipes</span>
              </div>
              <div className="menu-tools">
                <label className="search-field">
                  <Search size={19} />
                  <span className="sr-only">Search recipes</span>
                  <input
                    ref={search}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find something delicious..."
                  />
                </label>
                <div className="filters" aria-label="Recipe categories">
                  {['All recipes', 'Quick meals', 'Comfort food', 'Plant-forward'].map((item) => (
                    <button
                      key={item}
                      aria-pressed={category === item}
                      onClick={() => setCategory(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <p className="sr-only" role="status">
                {visible.length} recipes found
              </p>
              <div className="recipe-grid">
                {visible.map((recipe) => (
                  <button
                    className="recipe-card"
                    key={recipe.id}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setSelected(recipe);
                    }}
                    aria-label={`View ${recipe.name}`}
                  >
                    <div className={`recipe-art ${recipe.tone}`}>
                      <span className="recipe-emoji" aria-hidden="true">
                        {recipe.emoji}
                      </span>
                      <span className="category-label">{recipe.category}</span>
                    </div>
                    <div className="recipe-content">
                      <h3>{recipe.name}</h3>
                      <p>{recipe.subtitle}</p>
                      <div className="recipe-meta">
                        <span>
                          <Clock3 size={14} />
                          {recipe.minutes} min
                        </span>
                        <span>
                          <Users size={14} />
                          Serves {recipe.servings}
                        </span>
                        <ArrowRight size={17} className="card-arrow" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {visible.length === 0 && (
                <div className="empty-state">
                  <Search size={28} />
                  <h3>No recipes found</h3>
                  <p>Try another name or choose a different category.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery('');
                      setCategory('All recipes');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="page-panel">
            <p className="eyebrow">YOUR SHARED TABLE</p>
            <h1>{page}</h1>
            <div className="empty-state">
              {page === 'Meals' ? (
                <CalendarDays size={36} />
              ) : page === 'Shopping' ? (
                <ShoppingBasket size={36} />
              ) : (
                <House size={36} />
              )}
              <h2>
                {page === 'Meals'
                  ? 'Good meals start with a plan.'
                  : page === 'Shopping'
                    ? 'A clearer list. An easier shop.'
                    : 'A place for your favourite people.'}
              </h2>
              <p>
                {page === 'Meals'
                  ? 'Your household’s planned meals will live here.'
                  : page === 'Shopping'
                    ? 'Ingredients from your meal orders will come together here.'
                    : 'Your shared recipes and meal plans will belong to your household.'}
              </p>
              <p className="sample-note">
                This is a sample preview. Accounts and saved meal plans are not available yet.
              </p>
              <button className="primary-button" onClick={() => setPage('Menu')}>
                Browse sample recipes <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}
        <footer className="page-footer">
          <ChefHat size={18} />
          <p>A shared menu for the people you call home.</p>
          <span>Sample preview · Recipes are not saved</span>
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
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeRecipe();
        }}
        aria-labelledby="recipe-dialog-title"
      >
        <div className="dialog-header">
          <span className="eyebrow">SAMPLE RECIPE</span>
          <button className="icon-button" aria-label="Close recipe" onClick={closeRecipe}>
            <X size={22} />
          </button>
        </div>
        <h2 id="recipe-dialog-title">{selected?.name}</h2>
        <p className="dialog-subtitle">
          {selected?.minutes} minutes · Serves {selected?.servings}
        </p>
        <h3>What you’ll need</h3>
        <ul>
          {selected?.ingredients.map((ingredient) => (
            <li key={ingredient}>{ingredient}</li>
          ))}
        </ul>
        <p className="sample-note">
          A preview of your recipe collection. Full recipes, editing and meal ordering are coming
          next.
        </p>
      </dialog>
    </div>
  );
}
