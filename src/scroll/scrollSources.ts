import type { Terminal } from '@xterm/xterm';
import type { ScrollMetrics } from './overlayScrollbarGeometry';

/**
 * Abstracts "a thing that scrolls" so one overlay-scrollbar implementation can
 * drive both a native scroll container and an xterm terminal. `onScroll` fires
 * on user-initiated scroll (reveals the bar); `onLayout` fires on content/size
 * changes (updates geometry without revealing).
 */
export interface ScrollSource {
  getMetrics(): ScrollMetrics;
  scrollToOffset(offset: number): void;
  onScroll(cb: () => void): () => void;
  onLayout(cb: () => void): () => void;
}

/** Drive the overlay from a native scrolling DOM element. */
export function domScrollSource(el: HTMLElement): ScrollSource {
  return {
    getMetrics: () => ({
      viewport: el.clientHeight,
      content: el.scrollHeight,
      offset: el.scrollTop,
    }),
    scrollToOffset: (offset) => {
      el.scrollTop = offset;
    },
    onScroll: (cb) => {
      el.addEventListener('scroll', cb, { passive: true });
      return () => el.removeEventListener('scroll', cb);
    },
    onLayout: (cb) => {
      const ro = new ResizeObserver(cb);
      ro.observe(el);
      return () => ro.disconnect();
    },
  };
}

/**
 * Drive the overlay from an xterm Terminal, working in line units. The content
 * is `baseY + rows` (== buffer length for the normal buffer), the viewport is
 * `rows`, and the scroll offset is the top line `viewportY`. `scrollToLine`
 * maps an offset back to a scroll position. We use xterm's PUBLIC API only, so
 * this is stable across xterm's internal scrollbar changes (xterm 6 replaced
 * the native scrollbar with a VSCode-style one we deliberately hide).
 */
export function xtermScrollSource(term: Terminal): ScrollSource {
  const getMetrics = (): ScrollMetrics => {
    const buf = term.buffer.active;
    return { viewport: term.rows, content: buf.baseY + term.rows, offset: buf.viewportY };
  };
  return {
    getMetrics,
    scrollToOffset: (offset) => term.scrollToLine(Math.round(offset)),
    onScroll: (cb) => {
      const d = term.onScroll(() => cb());
      return () => d.dispose();
    },
    onLayout: (cb) => {
      const a = term.onRender(() => cb());
      const b = term.onResize(() => cb());
      return () => {
        a.dispose();
        b.dispose();
      };
    },
  };
}
