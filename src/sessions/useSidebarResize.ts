import { useCallback, useEffect, useRef } from 'react';
import { clampSidebarWidth, saveSidebarWidth } from './sidebarWidth';

export interface UseSidebarResize {
  onHandleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Pointer-drag to resize the right sidebar by its left edge (the drawer-resize
 * idiom). The sidebar is on the right, so dragging the handle LEFT widens it.
 * Live width streams through `setWidth`; the final value is persisted to
 * localStorage on mouseup. A teardown ref + unmount cleanup ensures the window
 * listeners (and the body cursor override) never leak if the drag is interrupted.
 */
export function useSidebarResize(width: number, setWidth: (w: number) => void): UseSidebarResize {
  const widthRef = useRef(width);
  widthRef.current = width;
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => () => teardownRef.current?.(), []);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault(); // no text-selection / focus shift from the press
      const startX = e.clientX;
      const startWidth = widthRef.current;
      let last = startWidth;
      document.body.style.cursor = 'col-resize';

      const move = (ev: MouseEvent) => {
        last = clampSidebarWidth(startWidth + (startX - ev.clientX));
        setWidth(last);
      };
      const teardown = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
      };
      const up = () => {
        teardown();
        teardownRef.current = null;
        saveSidebarWidth(last);
      };
      teardownRef.current = teardown;
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [setWidth],
  );

  return { onHandleMouseDown };
}
