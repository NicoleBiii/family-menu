import { useState } from 'react';
import { api, ApiError, type LibraryPhoto } from './api';
import { useI18n } from './i18n';

/** Search is always explicit. Only the search phrase and chosen Pexels photo id reach the provider. */
export function PhotoLibraryChooser({
  householdId,
  recipeId,
  onImported,
}: {
  householdId: string;
  recipeId: string;
  onImported: () => Promise<void> | void;
}) {
  const { t, apiError } = useI18n();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | 'search' | 'import' | null>(null);

  async function search(nextPage: number) {
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      const result = await api<{ photos: LibraryPhoto[]; page: number; hasMore: boolean }>(
        `/households/${householdId}/photo-library/search?query=${encodeURIComponent(query.trim())}&page=${nextPage}`,
      );
      setPhotos(result.photos);
      setPage(result.page);
      setHasMore(result.hasMore);
      setSearched(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'search');
    } finally {
      setBusy(false);
    }
  }

  async function choose(photoId: number) {
    setSelected(photoId);
    setBusy(true);
    setError(null);
    try {
      await api(`/households/${householdId}/recipes/${recipeId}/photo-library`, {
        method: 'POST',
        body: { photoId },
      });
      await onImported();
      setPhotos([]);
      setSearched(false);
      setSelected(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : 'import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-library">
      <h3>{t('photoLibrary.title')}</h3>
      <p className="muted">{t('photoLibrary.hint')}</p>
      <div className="photo-library-search">
        <label className="field">
          <span>{t('photoLibrary.searchLabel')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            minLength={2}
            maxLength={80}
            placeholder={t('photoLibrary.searchPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!busy && query.trim().length >= 2) void search(1);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || query.trim().length < 2}
          onClick={() => void search(1)}
        >
          {t(busy && selected === null ? 'photoLibrary.searching' : 'photoLibrary.search')}
        </button>
      </div>
      <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">
        {t('photoLibrary.providedBy')}
      </a>
      {error && (
        <p className="form-error" role="alert">
          {error instanceof ApiError && error.status < 500
            ? apiError(error)
            : t(selected === null ? 'photoLibrary.searchFailed' : 'photoLibrary.importFailed')}
        </p>
      )}
      {searched && photos.length === 0 && <p className="muted">{t('photoLibrary.empty')}</p>}
      {photos.length > 0 && (
        <>
          <div className="photo-library-grid">
            {photos.map((photo) => (
              <div className="photo-library-card" key={photo.id}>
                <img
                  src={photo.previewUrl}
                  alt={photo.alt}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t('photoLibrary.credit', { name: photo.photographer })}
                </a>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void choose(photo.id)}
                >
                  {t(
                    busy && selected === photo.id
                      ? 'photoLibrary.importing'
                      : 'photoLibrary.choose',
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="photo-library-pages">
            <button
              type="button"
              className="text-button"
              disabled={busy || page === 1}
              onClick={() => void search(page - 1)}
            >
              {t('photoLibrary.previous')}
            </button>
            <span>{t('photoLibrary.page', { number: page })}</span>
            <button
              type="button"
              className="text-button"
              disabled={busy || !hasMore}
              onClick={() => void search(page + 1)}
            >
              {t('photoLibrary.next')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
