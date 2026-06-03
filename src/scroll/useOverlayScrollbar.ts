import { useCallback, useEffect, useRef } from 'react';
import { createOverlayScrollbar, type OverlayScrollbar } from './createOverlayScrollbar';
import { domScrollSource } from './scrollSources';

/**
 * Attach the macOS-style overlay scrollbar to a native scrolling element.
 * Returns a callback ref to put on that element. Using a callback ref (rather
 * than a plain ref) means the overlay is created/disposed exactly when the
 * element mounts/unmounts — which matters for lists that render conditionally
 * (e.g. the projects list, hidden when only one project is open).
 *
 * The thumb mounts into the nearest positioned ancestor matching
 * `containerSelector` (default `.sidebar`) and is aligned to the element's box,
 * so the list's flex layout is untouched. Pass a `refreshKey` that changes when
 * the content size changes (e.g. the item count) to keep the thumb sized right.
 */
export function useOverlayScrollbar(refreshKey: unknown, containerSelector = '.sidebar') {
  const sbRef = useRef<OverlayScrollbar | null>(null);

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      sbRef.current?.dispose();
      sbRef.current = null;
      if (el) {
        const container = el.closest<HTMLElement>(containerSelector) ?? el.parentElement ?? el;
        sbRef.current = createOverlayScrollbar({ container, scrollEl: el, source: domScrollSource(el) });
      }
    },
    [containerSelector],
  );

  // Content changed (rows added/removed) → re-measure so the thumb tracks it.
  useEffect(() => {
    sbRef.current?.refresh();
  }, [refreshKey]);

  // Safety net: dispose if the component unmounts without the ref firing null.
  useEffect(
    () => () => {
      sbRef.current?.dispose();
      sbRef.current = null;
    },
    [],
  );

  return setRef;
}
