import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Camera,
  ChefHat,
  ImageOff,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  api,
  ApiError,
  formatIngredient,
  recipeImageUrl,
  signInUrl,
  uploadImage,
  type HouseholdSummary,
  type RecipeDetail,
  type RecipePreset,
  type RecipeSummary,
  type Session,
} from './api';
import { AiDraftPanel } from './AiDraftPanel';
import { prepareImage } from './image';
import { RecipeEditor, type EditorStart } from './RecipeEditor';

const TONES = ['lemon', 'sesame', 'tomato', 'greens'] as const;
function tone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

type Selected = { kind: 'preset'; preset: RecipePreset } | { kind: 'recipe'; recipe: RecipeDetail };

interface Props {
  session: Session | null;
  household: HouseholdSummary | undefined;
  onGoHousehold: () => void;
  onOrder: (recipeId: string, servings: number) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Shown above the menu, hidden while the editor is open. */
  hero: ReactNode;
}

export function MenuPage({ session, household, onGoHousehold, onOrder, searchRef, hero }: Props) {
  const [presets, setPresets] = useState<RecipePreset[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorStart | null>(null);
  const [aiPanel, setAiPanel] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photo, setPhoto] = useState({ busy: false, error: '' });
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const householdId = household?.id;

  useEffect(() => {
    api<RecipePreset[]>('/recipe-presets')
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);
  const loadRecipes = useCallback(async () => {
    if (!householdId) return setRecipes(null);
    try {
      setRecipes(await api<RecipeSummary[]>(`/households/${householdId}/recipes`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your menu.');
    }
  }, [householdId]);
  useEffect(() => {
    setEditor(null);
    void loadRecipes();
  }, [loadRecipes]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  function closeDialog() {
    dialog.current?.close();
    setSelected(null);
    setPhoto({ busy: false, error: '' });
    opener.current?.focus();
  }
  async function openRecipe(id: string, from: HTMLElement) {
    opener.current = from;
    setError('');
    try {
      setSelected({
        kind: 'recipe',
        recipe: await api<RecipeDetail>(`/households/${householdId}/recipes/${id}`),
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open the recipe.');
    }
  }
  async function setArchived(recipe: RecipeDetail, archived: boolean) {
    setError('');
    try {
      const next = await api<RecipeDetail>(
        `/households/${householdId}/recipes/${recipe.id}/${archived ? 'archive' : 'restore'}`,
        { method: 'POST', body: { expectedRevision: recipe.revision } },
      );
      // The dialog may have been closed while the request was in flight; do not reopen it.
      setSelected((current) =>
        current?.kind === 'recipe' && current.recipe.id === next.id
          ? { kind: 'recipe', recipe: next }
          : current,
      );
      setNotice(archived ? `${next.name} was archived.` : `${next.name} is back on the menu.`);
      await loadRecipes();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the recipe.');
      closeDialog();
      await loadRecipes();
    }
  }
  /** Uploads a new photo, or removes the current one when `file` is null. */
  async function changePhoto(recipe: RecipeDetail, file: File | null) {
    setPhoto({ busy: true, error: '' });
    try {
      const path = `/households/${householdId}/recipes/${recipe.id}`;
      if (file) await uploadImage(`${path}/image`, await prepareImage(file));
      else await api(`${path}/image`, { method: 'DELETE' });
      const next = await api<RecipeDetail>(path);
      setSelected((current) =>
        current?.kind === 'recipe' && current.recipe.id === next.id
          ? { kind: 'recipe', recipe: next }
          : current,
      );
      setPhoto({ busy: false, error: '' });
      await loadRecipes();
    } catch (caught) {
      setPhoto({
        busy: false,
        error: caught instanceof Error ? caught.message : 'Could not update the photo.',
      });
    }
  }
  const imageUrl = (recipeId: string, imageId: string | null) =>
    householdId && imageId ? recipeImageUrl(householdId, recipeId, imageId) : undefined;

  function startEditor(start: EditorStart) {
    dialog.current?.close();
    setSelected(null);
    setNotice('');
    setAiPanel(false);
    setEditor(start);
    window.scrollTo({ top: 0 });
  }

  if (editor && householdId) {
    return (
      <section className="page-panel">
        <RecipeEditor
          householdId={householdId}
          start={editor}
          onCancel={() => {
            // Leaving an AI draft keeps it under "Unfinished drafts".
            setAiPanel(editor.mode === 'ai');
            setEditor(null);
          }}
          onSaved={async (saved) => {
            setEditor(null);
            setNotice(`Saved ${saved.name}.`);
            await loadRecipes();
          }}
          onDiscarded={() => {
            setEditor(null);
            setNotice('Draft discarded. Your menu is unchanged.');
          }}
        />
      </section>
    );
  }

  if (aiPanel && householdId) {
    return (
      <section className="page-panel">
        <AiDraftPanel
          householdId={householdId}
          onReview={(draft) => {
            if (draft.draft) startEditor({ mode: 'ai', draft: { ...draft, draft: draft.draft } });
          }}
          onManual={() => startEditor({ mode: 'create' })}
          onClose={() => setAiPanel(false)}
        />
      </section>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(needle);
  const active = (recipes ?? []).filter((recipe) => !recipe.archived);
  const archived = (recipes ?? []).filter((recipe) => recipe.archived);
  const visibleRecipes = (showArchived ? archived : active).filter((recipe) =>
    matches(recipe.name),
  );
  const visiblePresets = (presets ?? []).filter((preset) => matches(preset.name));
  const signedIn = session?.authenticated === true;

  return (
    <>
      {hero}
      <section className="menu-section" aria-labelledby="menu-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {household ? household.name.toUpperCase() : 'SOMETHING FOR EVERYONE'}
            </p>
            <h2 id="menu-title">{household ? 'Your household menu' : 'Starter recipes'}</h2>
          </div>
          <span className="recipe-count">
            {household
              ? `${active.length} recipe${active.length === 1 ? '' : 's'}`
              : `${presets?.length ?? 0} starter recipes`}
          </span>
        </div>
        <div className="menu-tools">
          <label className="search-field">
            <Search size={19} />
            <span className="sr-only">Search recipes</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find something delicious..."
            />
          </label>
          {household && (
            <div className="menu-actions">
              <button
                className="archive-toggle"
                aria-pressed={showArchived}
                onClick={() => setShowArchived((value) => !value)}
              >
                <Archive size={14} /> Archived ({archived.length})
              </button>
              <button
                className="archive-toggle ai-toggle"
                onClick={() => {
                  setNotice('');
                  setAiPanel(true);
                  window.scrollTo({ top: 0 });
                }}
              >
                <Sparkles size={14} aria-hidden="true" /> Draft with AI
              </button>
              <button className="primary-button" onClick={() => startEditor({ mode: 'create' })}>
                <Plus size={18} /> Add recipe
              </button>
            </div>
          )}
        </div>
        <p className="sr-only" role="status">
          {`${household ? visibleRecipes.length : visiblePresets.length} recipes found`}
        </p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {household ? (
          recipes === null ? (
            <p role="status">Loading your menu…</p>
          ) : visibleRecipes.length > 0 ? (
            <div className="recipe-grid">
              {visibleRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  id={recipe.id}
                  name={recipe.name}
                  description={recipe.description}
                  servings={recipe.servings}
                  label={recipe.archived ? 'Archived' : `${recipe.pricePoints} pts / serving`}
                  imageUrl={imageUrl(recipe.id, recipe.imageId)}
                  onOpen={(target) => openRecipe(recipe.id, target)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <BookOpen size={28} />
              <h3>
                {needle
                  ? 'No recipes found'
                  : showArchived
                    ? 'Nothing archived'
                    : 'Your menu is empty'}
              </h3>
              <p>
                {needle
                  ? 'Try another name.'
                  : showArchived
                    ? 'Archived recipes stay here, ready to restore.'
                    : 'Add a family favourite, or save one of the starter recipes below and make it yours.'}
              </p>
              {needle && (
                <button className="text-button" onClick={() => setQuery('')}>
                  Clear search
                </button>
              )}
            </div>
          )
        ) : (
          <>
            {signedIn && (
              <p className="sample-note">
                Create or join a household to save and edit your own copies.{' '}
                <button className="text-button inline" onClick={onGoHousehold}>
                  Go to Household
                </button>
              </p>
            )}
            <PresetGrid
              presets={presets}
              visible={visiblePresets}
              onOpen={(preset, target) => {
                opener.current = target;
                setSelected({ kind: 'preset', preset });
              }}
              onClear={() => setQuery('')}
            />
          </>
        )}
      </section>

      {household && (
        <section className="menu-section" aria-labelledby="starter-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEED IDEAS?</p>
              <h2 id="starter-title">Starter recipes</h2>
            </div>
            <span className="recipe-count">Save a copy, then make it yours</span>
          </div>
          <PresetGrid
            presets={presets}
            visible={visiblePresets}
            onOpen={(preset, target) => {
              opener.current = target;
              setSelected({ kind: 'preset', preset });
            }}
            onClear={() => setQuery('')}
          />
        </section>
      )}

      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        aria-labelledby="recipe-dialog-title"
      >
        {selected && (
          <RecipeView
            selected={selected}
            canSave={Boolean(household)}
            signInHref={
              signedIn || !session?.signInAvailable ? null : signInUrl(window.location.pathname)
            }
            onClose={closeDialog}
            onUsePreset={(preset) =>
              startEditor({
                mode: 'create',
                presetId: preset.id,
                content: preset,
              })
            }
            onEdit={(recipe) => startEditor({ mode: 'edit', recipe })}
            onOrder={(recipe) => {
              closeDialog();
              onOrder(recipe.id, recipe.servings);
            }}
            onArchive={setArchived}
            imageUrl={
              selected.kind === 'recipe'
                ? imageUrl(selected.recipe.id, selected.recipe.imageId)
                : undefined
            }
            photo={photo}
            onPhoto={changePhoto}
          />
        )}
      </dialog>
    </>
  );
}

function RecipeCard({
  id,
  name,
  description,
  servings,
  label,
  imageUrl,
  onOpen,
}: {
  id: string;
  name: string;
  description: string;
  servings: number;
  label: string;
  imageUrl?: string;
  onOpen: (target: HTMLElement) => void;
}) {
  return (
    <button
      className="recipe-card"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`View ${name}`}
    >
      <div className={`recipe-art ${tone(id)}`}>
        {imageUrl ? (
          <img className="recipe-photo" src={imageUrl} alt="" loading="lazy" />
        ) : (
          // Without a household photo: an honest placeholder rather than an unrelated picture.
          <span className="recipe-initial" aria-hidden="true">
            {Array.from(name.trim())[0] ?? '?'}
          </span>
        )}
        <span className="category-label">{label}</span>
      </div>
      <div className="recipe-content">
        <h3>{name}</h3>
        <p>{description}</p>
        <div className="recipe-meta">
          <span>
            <Users size={14} />
            Serves {servings}
          </span>
          <ArrowRight size={17} className="card-arrow" />
        </div>
      </div>
    </button>
  );
}

function PresetGrid({
  presets,
  visible,
  onOpen,
  onClear,
}: {
  presets: RecipePreset[] | null;
  visible: RecipePreset[];
  onOpen: (preset: RecipePreset, target: HTMLElement) => void;
  onClear: () => void;
}) {
  if (presets === null) return <p role="status">Loading starter recipes…</p>;
  if (visible.length === 0) {
    return (
      <div className="empty-state">
        <Search size={28} />
        <h3>No starter recipes found</h3>
        <p>Try another name.</p>
        <button className="text-button" onClick={onClear}>
          Clear search
        </button>
      </div>
    );
  }
  return (
    <div className="recipe-grid">
      {visible.map((preset) => (
        <RecipeCard
          key={preset.id}
          id={preset.id}
          name={preset.name}
          description={preset.description}
          servings={preset.servings}
          label="Starter"
          onOpen={(target) => onOpen(preset, target)}
        />
      ))}
    </div>
  );
}

function RecipeView({
  selected,
  canSave,
  signInHref,
  onClose,
  onUsePreset,
  onEdit,
  onOrder,
  onArchive,
  imageUrl,
  photo,
  onPhoto,
}: {
  selected: Selected;
  canSave: boolean;
  signInHref: string | null;
  onClose: () => void;
  onUsePreset: (preset: RecipePreset) => void;
  onEdit: (recipe: RecipeDetail) => void;
  onOrder: (recipe: RecipeDetail) => void;
  onArchive: (recipe: RecipeDetail, archived: boolean) => Promise<void>;
  imageUrl?: string;
  photo: { busy: boolean; error: string };
  onPhoto: (recipe: RecipeDetail, file: File | null) => Promise<void>;
}) {
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const content = selected.kind === 'preset' ? selected.preset : selected.recipe;
  const recipe = selected.kind === 'recipe' ? selected.recipe : null;
  function onPhotoDrag(event: DragEvent<HTMLDivElement>, entering: boolean) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (entering) dragDepth.current += 1;
    else dragDepth.current = Math.max(0, dragDepth.current - 1);
    setDragActive(dragDepth.current > 0);
  }
  return (
    <>
      <div className="dialog-header">
        <span className="eyebrow">
          {recipe ? (recipe.archived ? 'ARCHIVED RECIPE' : 'YOUR MENU') : 'STARTER RECIPE'}
        </span>
        <button className="icon-button" aria-label="Close recipe" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      {imageUrl && <img className="dialog-photo" src={imageUrl} alt={`Photo of ${content.name}`} />}
      <h2 id="recipe-dialog-title">{content.name}</h2>
      <p className="dialog-subtitle">
        Serves {content.servings}
        {recipe && (
          <>
            {' · '}
            <Star size={13} aria-hidden="true" /> {recipe.pricePoints} points per serving
          </>
        )}
      </p>
      {content.description && <p className="dialog-description">{content.description}</p>}
      <h3>What you’ll need</h3>
      {content.ingredients.length > 0 ? (
        <ul>
          {content.ingredients.map((line, index) => (
            <li key={index}>{formatIngredient(line)}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No ingredients listed yet.</p>
      )}
      {content.steps.length > 0 && (
        <>
          <h3>Method</h3>
          <ol>
            {content.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </>
      )}
      {recipe && (
        <p className="muted">
          Added by {recipe.createdBy}
          {recipe.updatedBy !== recipe.createdBy || recipe.revision > 1
            ? ` · last changed by ${recipe.updatedBy}`
            : ''}
          {recipe.presetId ? ' · from a starter recipe' : ''}
          {recipe.source === 'ai' ? ' · started from an AI draft' : ''}
        </p>
      )}
      {recipe && !recipe.archived && (
        <div className="photo-actions">
          <div
            className={`photo-dropzone${dragActive ? ' dragging' : ''}`}
            onDragEnter={(event) => onPhotoDrag(event, true)}
            onDragLeave={(event) => onPhotoDrag(event, false)}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('Files')) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragActive(false);
              const file = event.dataTransfer.files[0];
              if (!photo.busy && file) void onPhoto(recipe, file);
            }}
          >
            <span className="photo-drop-hint">Drop a photo here or</span>
            <label
              className={`primary-button file-button photo-upload-button${photo.busy ? ' busy' : ''}`}
            >
              <Camera size={18} aria-hidden="true" />
              {photo.busy ? 'Saving photo…' : recipe.imageId ? 'Change photo' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photo.busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void onPhoto(recipe, file);
                }}
              />
            </label>
          </div>
          {recipe.imageId && (
            <button
              className="text-button"
              disabled={photo.busy}
              onClick={() => onPhoto(recipe, null)}
            >
              <ImageOff size={16} /> Remove photo
            </button>
          )}
          {photo.error && (
            <p className="form-error" role="alert">
              {photo.error}
            </p>
          )}
        </div>
      )}
      <div className="form-actions">
        {selected.kind === 'preset' &&
          (canSave ? (
            <button className="primary-button" onClick={() => onUsePreset(selected.preset)}>
              <Plus size={18} /> Save to our menu
            </button>
          ) : signInHref ? (
            <a className="primary-button" href={signInHref}>
              Sign in to save recipes
            </a>
          ) : (
            <p className="sample-note">
              <ChefHat size={14} aria-hidden="true" /> Create or join a household to save your own
              copy.
            </p>
          ))}
        {recipe && !recipe.archived && (
          <>
            <button className="primary-button" onClick={() => onOrder(recipe)}>
              <CalendarPlus size={18} /> Order
            </button>
            <button className="text-button" onClick={() => onEdit(recipe)}>
              <Pencil size={16} /> Edit
            </button>
            <button className="text-button" onClick={() => onArchive(recipe, true)}>
              <Archive size={16} /> Archive
            </button>
          </>
        )}
        {recipe?.archived && (
          <button className="primary-button" onClick={() => onArchive(recipe, false)}>
            <ArchiveRestore size={18} /> Restore to menu
          </button>
        )}
      </div>
    </>
  );
}
