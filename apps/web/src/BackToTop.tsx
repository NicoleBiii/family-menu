import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useI18n } from './i18n';

/** Appears once the page has scrolled more than one screen; returns to the top in one tap. */
export function BackToTop() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  if (!visible) return null;
  return (
    <button
      className="back-to-top"
      aria-label={t('app.backToTop')}
      onClick={() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        // Keyboard and screen-reader users continue from the top of the page.
        document.querySelector<HTMLElement>('.skip-link')?.focus({ preventScroll: true });
      }}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}
