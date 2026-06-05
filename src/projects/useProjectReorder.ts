import { useCallback, useRef, useState } from 'react';
import { rowShift, targetIndex } from './reorderGeometry';

/** Movement past this many px turns a press into a drag (below it stays a click). */
const THRESHOLD = 4;

interface DragState {
  id: string;
  source: number;
  startY: number;
  midpoints: number[];
  rowHeight: number;
  deltaY: number;
  target: number;
}

export interface UseProjectReorder {
  draggingId: string | null;
  /** onMouseDown handler factory for a row (id + its index). */
  onRowMouseDown: (id: string, index: number) => (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Per-row inline transform while a drag is in progress (undefined otherwise). */
  rowStyle: (index: number) => React.CSSProperties | undefined;
  /** Whether `index` is the row being dragged (for the lifted `.dragging` class). */
  isDragging: (index: number) => boolean;
  /** True once immediately after a real drag — lets the row suppress its click. */
  consumeDidDrag: () => boolean;
}

/**
 * Begin a potential drag from a row mousedown. Installs window mousemove/mouseup
 * (the drawer-resize idiom). A press that never crosses `THRESHOLD` stays a
 * click: `apply` is never called and `commit` never fires. A real drag streams
 * `DragState` through `apply` and commits the final index on mouseup.
 */
function installDrag(
  e: React.MouseEvent<HTMLDivElement>,
  id: string,
  index: number,
  apply: (d: DragState | null) => void,
  commit: (id: string, toIndex: number) => void,
): void {
  if (e.button !== 0) return;
  // The × close button lives inside the row — don't start a drag from it.
  if ((e.target as HTMLElement).closest('.list-row-close')) return;
  const list = e.currentTarget.parentElement;
  if (!list) return;
  const rects = Array.from(list.children).map((c) => c.getBoundingClientRect());
  const midpoints = rects.map((r) => r.top + r.height / 2);
  const rowHeight = rects[index]?.height ?? 0;
  const startY = e.clientY;
  let current: DragState | null = null;

  const move = (ev: MouseEvent) => {
    const deltaY = ev.clientY - startY;
    if (!current && Math.abs(deltaY) < THRESHOLD) return;
    current = { id, source: index, startY, midpoints, rowHeight, deltaY, target: targetIndex(ev.clientY, midpoints, index) };
    apply(current);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    if (current) commit(current.id, current.target);
    apply(null);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/**
 * Hand-rolled pointer reorder for the projects list. A press below `THRESHOLD`
 * is left as a click (row select); a real drag commits via `onReorder` on
 * mouseup and sets a one-shot `didDrag` flag the row reads to skip its click.
 */
export function useProjectReorder(onReorder: (id: string, toIndex: number) => void): UseProjectReorder {
  const [drag, setDrag] = useState<DragState | null>(null);
  const didDragRef = useRef(false);

  const onRowMouseDown = useCallback(
    (id: string, index: number) => (e: React.MouseEvent<HTMLDivElement>) => {
      // Reset on every press so a stuck flag from a drag that fired no trailing
      // click (mouseup landed off-row) can't suppress this gesture's click.
      didDragRef.current = false;
      installDrag(e, id, index, setDrag, (rid, toIndex) => {
        didDragRef.current = true;
        onReorder(rid, toIndex);
      });
    },
    [onReorder],
  );

  const rowStyle = useCallback(
    (index: number): React.CSSProperties | undefined => {
      if (!drag) return undefined;
      if (index === drag.source) {
        return { transform: `translateY(${drag.deltaY}px)`, zIndex: 2, position: 'relative' };
      }
      return { transform: `translateY(${rowShift(index, drag.source, drag.target, drag.rowHeight)}px)` };
    },
    [drag],
  );

  const isDragging = useCallback((index: number) => drag?.source === index, [drag]);

  const consumeDidDrag = useCallback(() => {
    if (!didDragRef.current) return false;
    didDragRef.current = false;
    return true;
  }, []);

  return { draggingId: drag?.id ?? null, onRowMouseDown, rowStyle, isDragging, consumeDidDrag };
}
