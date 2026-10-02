import type { IngredientInput } from './recipes.service.js';

/**
 * Curated starter recipes. They are read-only source data: a household that adds one saves an
 * independent copy, so editing that copy never changes the preset. Text was written for this
 * project; provenance is recorded in docs/presets/PROVENANCE.md. Presets carry no photographs
 * and no virtual price; the household chooses those.
 *
 * Bump `version` when a preset's content changes so saved copies can be traced to the text they
 * started from.
 */
/**
 * Suggested category for a saved copy (ADR 0007). The interface names it in the current language
 * and offers it to the member; the API never creates a household category from it.
 */
export const PRESET_CATEGORIES = [
  'breakfast',
  'mains',
  'noodlesRice',
  'soups',
  'vegetables',
] as const;

export interface RecipePreset {
  id: string;
  version: number;
  category: (typeof PRESET_CATEGORIES)[number];
  name: string;
  description: string;
  servings: number;
  steps: string[];
  ingredients: IngredientInput[];
}

const line = (
  name: string,
  quantity: string | null,
  unit: IngredientInput['unit'],
  extra: { form?: string; note?: string } = {},
): IngredientInput => ({
  name,
  quantity,
  unit,
  form: extra.form ?? null,
  note: extra.note ?? null,
});

export const RECIPE_PRESETS: readonly RecipePreset[] = [
  {
    id: 'tomato-egg-stir-fry',
    version: 1,
    category: 'mains',
    name: 'Tomato & egg stir-fry 番茄炒蛋',
    description: 'Soft scrambled eggs folded into a quick, saucy tomato base.',
    servings: 2,
    ingredients: [
      line('egg', '3', null),
      line('tomato', '2', null, { form: 'cut into wedges' }),
      line('cooking oil', '2', 'tbsp'),
      line('sugar', '1', 'tsp'),
      line('salt', null, null, { note: 'to taste' }),
      line('green onion', null, null, { form: 'sliced', note: 'optional garnish' }),
    ],
    steps: [
      'Beat the eggs with a pinch of salt.',
      'Heat half the oil and scramble the eggs until just set; move them to a plate.',
      'Add the remaining oil, cook the tomato until it softens and releases juice, then add the sugar and salt.',
      'Return the eggs, stir gently to coat, and finish with green onion.',
    ],
  },
  {
    id: 'lemon-herb-chicken',
    version: 1,
    category: 'mains',
    name: 'Lemon herb chicken',
    description: 'Pan-seared chicken breast with lemon, garlic and rosemary.',
    servings: 2,
    ingredients: [
      line('chicken breast', '300', 'g', { form: 'raw' }),
      line('lemon', '1', null),
      line('garlic', '2', 'clove', { form: 'minced' }),
      line('olive oil', '1', 'tbsp'),
      line('rosemary', null, null, { note: 'to taste' }),
      line('salt', null, null, { note: 'to taste' }),
    ],
    steps: [
      'Season the chicken with salt, rosemary, half the lemon juice and the garlic; rest 10 minutes.',
      'Sear in the olive oil over medium-high heat, 5–6 minutes per side, until cooked through.',
      'Rest 5 minutes, then slice and squeeze over the remaining lemon.',
    ],
  },
  {
    id: 'sesame-noodle-bowl',
    version: 1,
    category: 'noodlesRice',
    name: 'Sesame noodle bowl',
    description: 'Cold noodles in a nutty sesame sauce with crisp cucumber.',
    servings: 2,
    ingredients: [
      line('wheat noodles', '200', 'g', { form: 'dried' }),
      line('cucumber', '1', null, { form: 'julienned' }),
      line('sesame paste', '2', 'tbsp'),
      line('soy sauce', '1', 'tbsp'),
      line('rice vinegar', '1', 'tsp'),
      line('chili oil', null, null, { note: 'optional, to taste' }),
    ],
    steps: [
      'Cook the noodles as the package directs, rinse under cold water and drain well.',
      'Whisk the sesame paste, soy sauce and vinegar with a little warm water until pourable.',
      'Toss the noodles with the sauce, top with cucumber and add chili oil if you like.',
    ],
  },
  {
    id: 'roasted-vegetable-bowl',
    version: 1,
    category: 'vegetables',
    name: 'Roasted vegetable bowl',
    description: 'Sheet-pan broccoli and sweet potato over rice.',
    servings: 2,
    ingredients: [
      line('broccoli', '300', 'g', { form: 'florets' }),
      line('sweet potato', '200', 'g', { form: 'cubed' }),
      line('olive oil', '1', 'tbsp'),
      line('cooked rice', '300', 'g'),
      line('black pepper', null, null, { note: 'to taste' }),
      line('salt', null, null, { note: 'to taste' }),
    ],
    steps: [
      'Heat the oven to 220 °C.',
      'Toss the sweet potato with half the oil and roast 15 minutes.',
      'Add the broccoli with the remaining oil, salt and pepper; roast 12–15 minutes more.',
      'Serve over warm rice.',
    ],
  },
  {
    id: 'egg-fried-rice',
    version: 1,
    category: 'noodlesRice',
    name: 'Egg fried rice 蛋炒饭',
    description: 'A fast way to use yesterday’s rice.',
    servings: 2,
    ingredients: [
      line('cooked rice', '400', 'g', { note: 'day-old works best' }),
      line('egg', '2', null),
      line('frozen peas', '100', 'g'),
      line('green onion', '2', null, { form: 'sliced' }),
      line('soy sauce', '1', 'tbsp'),
      line('cooking oil', '2', 'tbsp'),
    ],
    steps: [
      'Break up any clumps in the rice.',
      'Scramble the eggs in half the oil, then set aside.',
      'Stir-fry the rice in the remaining oil over high heat until hot, add the peas and cook 2 minutes.',
      'Add the soy sauce, eggs and green onion; toss and serve.',
    ],
  },
  {
    id: 'mapo-tofu',
    version: 1,
    category: 'mains',
    name: 'Mapo tofu 麻婆豆腐',
    description: 'Silken tofu in a spicy, savory pork and bean sauce.',
    servings: 3,
    ingredients: [
      line('soft tofu', '400', 'g', { form: 'cubed' }),
      line('ground pork', '150', 'g', { form: 'raw' }),
      line('doubanjiang (chili bean paste)', '2', 'tbsp'),
      line('garlic', '2', 'clove', { form: 'minced' }),
      line('cornstarch', '1', 'tsp', { note: 'mixed with 2 tbsp water' }),
      line('Sichuan peppercorn', null, null, { form: 'ground', note: 'to taste' }),
      line('cooking oil', '1', 'tbsp'),
    ],
    steps: [
      'Blanch the tofu cubes in simmering salted water for 2 minutes; drain.',
      'Brown the pork in the oil, add the garlic and bean paste and fry until fragrant.',
      'Add 150 ml water and the tofu; simmer gently 5 minutes.',
      'Stir in the cornstarch mixture to thicken and finish with ground Sichuan peppercorn.',
    ],
  },
  {
    id: 'beef-broccoli',
    version: 1,
    category: 'mains',
    name: 'Beef and broccoli',
    description: 'Tender sliced beef and broccoli in a glossy soy-garlic sauce.',
    servings: 3,
    ingredients: [
      line('flank steak', '350', 'g', { form: 'thinly sliced' }),
      line('broccoli', '300', 'g', { form: 'florets' }),
      line('soy sauce', '3', 'tbsp'),
      line('oyster sauce', '1', 'tbsp'),
      line('garlic', '3', 'clove', { form: 'minced' }),
      line('cornstarch', '2', 'tsp'),
      line('cooking oil', '2', 'tbsp'),
    ],
    steps: [
      'Toss the beef with 1 tbsp soy sauce and the cornstarch.',
      'Steam or blanch the broccoli until bright green; drain.',
      'Sear the beef in the oil over high heat in batches; set aside.',
      'Fry the garlic briefly, add the remaining soy and oyster sauce with 60 ml water, then return the beef and broccoli and toss until glossy.',
    ],
  },
  {
    id: 'chicken-congee',
    version: 1,
    category: 'soups',
    name: 'Chicken congee 鸡肉粥',
    description: 'Slow-simmered rice porridge with ginger and shredded chicken.',
    servings: 4,
    ingredients: [
      line('white rice', '150', 'g', { form: 'uncooked' }),
      line('chicken thigh', '300', 'g', { form: 'raw, boneless' }),
      line('ginger', '1', 'piece', { form: 'thumb-sized, sliced' }),
      line('water', '2', 'l'),
      line('salt', null, null, { note: 'to taste' }),
      line('green onion', null, null, { form: 'sliced', note: 'garnish' }),
    ],
    steps: [
      'Rinse the rice, then bring it to a boil with the water, ginger and chicken.',
      'Simmer partly covered for about 1 hour, stirring now and then, until creamy.',
      'Lift out the chicken, shred it and stir it back in; season with salt.',
      'Serve topped with green onion.',
    ],
  },
  {
    id: 'spaghetti-bolognese',
    version: 1,
    category: 'noodlesRice',
    name: 'Spaghetti bolognese',
    description: 'A weeknight meat sauce simmered with tomatoes.',
    servings: 4,
    ingredients: [
      line('spaghetti', '400', 'g', { form: 'dried' }),
      line('ground beef', '500', 'g', { form: 'raw' }),
      line('crushed tomatoes', '1', 'can', { note: 'about 800 g' }),
      line('onion', '1', null, { form: 'diced' }),
      line('carrot', '1', null, { form: 'diced' }),
      line('garlic', '2', 'clove', { form: 'minced' }),
      line('olive oil', '2', 'tbsp'),
      line('salt', null, null, { note: 'to taste' }),
    ],
    steps: [
      'Soften the onion and carrot in the olive oil, about 8 minutes; add the garlic.',
      'Brown the beef, breaking it up.',
      'Add the tomatoes and simmer 30 minutes, stirring occasionally; season.',
      'Cook the spaghetti, drain and toss with the sauce.',
    ],
  },
  {
    id: 'pancakes',
    version: 1,
    category: 'breakfast',
    name: 'Fluffy pancakes',
    description: 'A simple weekend breakfast batter.',
    servings: 4,
    ingredients: [
      line('all-purpose flour', '200', 'g'),
      line('milk', '300', 'ml'),
      line('egg', '1', null),
      line('sugar', '2', 'tbsp'),
      line('baking powder', '2', 'tsp'),
      line('butter', '30', 'g', { form: 'melted' }),
      line('salt', '1', 'pinch'),
    ],
    steps: [
      'Whisk the flour, sugar, baking powder and salt.',
      'Whisk in the milk, egg and melted butter until just combined; a few lumps are fine.',
      'Cook 60 ml portions on a lightly buttered pan until bubbles form, then flip and cook until golden.',
    ],
  },
  {
    id: 'greek-salad',
    version: 1,
    category: 'vegetables',
    name: 'Greek salad',
    description: 'Crunchy vegetables, olives and feta with an oregano dressing.',
    servings: 2,
    ingredients: [
      line('tomato', '2', null, { form: 'cut into chunks' }),
      line('cucumber', '1', null, { form: 'sliced' }),
      line('red onion', '0.5', null, { form: 'thinly sliced' }),
      line('feta cheese', '100', 'g'),
      line('kalamata olives', '60', 'g'),
      line('olive oil', '2', 'tbsp'),
      line('dried oregano', '1', 'tsp'),
    ],
    steps: [
      'Combine the tomato, cucumber, onion and olives.',
      'Drizzle with olive oil, sprinkle with oregano and toss.',
      'Top with the feta just before serving.',
    ],
  },
  {
    id: 'garlic-bok-choy',
    version: 1,
    category: 'vegetables',
    name: 'Garlic bok choy 蒜蓉小白菜',
    description: 'A two-minute green side dish.',
    servings: 2,
    ingredients: [
      line('baby bok choy', '400', 'g', { form: 'halved' }),
      line('garlic', '4', 'clove', { form: 'minced' }),
      line('cooking oil', '1', 'tbsp'),
      line('oyster sauce', '1', 'tbsp', { note: 'optional' }),
      line('salt', null, null, { note: 'to taste' }),
    ],
    steps: [
      'Heat the oil and fry the garlic until fragrant but not brown.',
      'Add the bok choy and a splash of water; stir-fry 2–3 minutes until just tender.',
      'Season with salt or oyster sauce and serve immediately.',
    ],
  },
];

const byId = new Map(RECIPE_PRESETS.map((preset) => [preset.id, preset]));

export function findPreset(id: unknown): RecipePreset | undefined {
  return typeof id === 'string' ? byId.get(id) : undefined;
}
