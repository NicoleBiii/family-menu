import { useEffect, useRef } from 'react';

let owners = 0;

/**
 * Gives a page's in-place views (editor, AI panel, dialog…) their own browser history entries,
 * so Back — the browser's, a phone's swipe or the page's own Back — leaves one view at a time
 * instead of the whole page. `stack` lists the open views from outermost to innermost; `up`
 * closes the innermost one. Views closed by the page itself (Cancel, Save) remove their entries.
 */
export function useViewHistory(stack: string[], up: () => void) {
  const owner = useRef(0);
  if (owner.current === 0) owner.current = ++owners;
  /** How many entries this page has pushed above its own. */
  const depth = useRef(0);
  /** A Back this hook started itself; its popstate must not close another view. */
  const ownPop = useRef(false);
  const upRef = useRef(up);
  upRef.current = up;
  const key = stack.join('/');

  useEffect(() => {
    const state = history.state as { viewOwner?: number; viewDepth?: number } | null;
    const ours = state?.viewOwner === owner.current;
    const target = stack.length;
    if (target > depth.current) {
      for (let level = depth.current + 1; level <= target; level += 1) {
        history.pushState(
          { inApp: true, viewOwner: owner.current, viewDepth: level, view: stack[level - 1] },
          '',
          location.href,
        );
      }
    } else if (target < depth.current) {
      // Only step back while our entry is current; if the page already navigated elsewhere
      // (e.g. to Home after adding to the basket), leave the newer entry alone.
      if (ours) {
        ownPop.current = true;
        history.go(target - depth.current);
      }
    } else if (target > 0 && ours) {
      history.replaceState({ ...state, view: stack[target - 1] }, '', location.href);
    }
    depth.current = target;
    // `key` captures the stack's contents.
  }, [key]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (ownPop.current) {
        ownPop.current = false;
        return;
      }
      const state = event.state as { viewOwner?: number; viewDepth?: number } | null;
      const reached = state?.viewOwner === owner.current ? (state.viewDepth ?? 0) : 0;
      // Forward navigation into a view that is no longer open is ignored.
      for (let level = depth.current; level > reached; level -= 1) upRef.current();
      depth.current = Math.min(depth.current, reached);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
