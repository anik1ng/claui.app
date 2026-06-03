import { computeThumb, offsetForThumbTop, MIN_THUMB } from './overlayScrollbarGeometry';
import type { ScrollSource } from './scrollSources';
import './overlayScrollbar.css';

export interface OverlayScrollbarOptions {
  /** Positioned (relative/absolute) element the thumb is mounted into. */
  container: HTMLElement;
  /** The scrolling element whose box the thumb overlays (used for alignment). */
  scrollEl: HTMLElement;
  source: ScrollSource;
  /** ms the bar stays visible after the last scroll/hover before it fades. */
  fadeDelay?: number;
}

export interface OverlayScrollbar {
  /** Recompute geometry — call after external content/size changes. */
  refresh(): void;
  dispose(): void;
}

/** Gap (px) between the thumb and the container's right edge. */
const INSET = 2;
/** Pointer within this many px of the right edge reveals the bar (macOS-like). */
const EDGE_REVEAL = 22;

/**
 * A macOS-style overlay scrollbar: invisible at rest, fades in on scroll or when
 * the pointer nears the right edge, fades out after a short idle, and stays up
 * while hovered or dragged. The thumb is the only interactive part — the track
 * is never drawn and never blocks the content (reveal-on-edge uses a passive
 * pointermove listener rather than a hit-testing overlay).
 */
class OverlayScrollbarController implements OverlayScrollbar {
  private readonly thumb = document.createElement('div');
  private readonly fadeDelay: number;
  private fadeTimer = 0;
  private dragging = false;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private disposed = false;
  private readonly cleanups: Array<() => void> = [];
  // Cached on every layout() (scroll / render / resize) so the per-pointermove
  // edge-reveal and the drag handler don't force a reflow on each mouse move
  // over an actively-rendering terminal.
  private scrollRect: DOMRect = new DOMRect();

  constructor(
    private readonly container: HTMLElement,
    private readonly scrollEl: HTMLElement,
    private readonly source: ScrollSource,
    fadeDelay: number,
  ) {
    this.fadeDelay = fadeDelay;
    this.thumb.className = 'overlay-scrollbar-thumb';
    container.appendChild(this.thumb);

    const t = this.thumb;
    t.addEventListener('pointerdown', this.onPointerDown);
    t.addEventListener('pointermove', this.onPointerMove);
    t.addEventListener('pointerup', this.onPointerUp);
    t.addEventListener('pointercancel', this.onPointerUp);
    t.addEventListener('pointerenter', this.onThumbEnter);
    t.addEventListener('pointerleave', this.onThumbLeave);
    scrollEl.addEventListener('pointermove', this.onEdgeMove, { passive: true });

    this.cleanups.push(source.onScroll(this.onScroll));
    this.cleanups.push(source.onLayout(this.refresh));
    const ro = new ResizeObserver(this.refresh);
    ro.observe(scrollEl);
    ro.observe(container);
    this.cleanups.push(() => ro.disconnect());

    this.layout();
  }

  refresh = (): void => this.layout();

  /** Show the bar and (re)arm the idle fade unless dragging/hovered. */
  private reveal(): void {
    if (this.disposed) return;
    this.thumb.classList.add('is-visible');
    window.clearTimeout(this.fadeTimer);
    this.fadeTimer = window.setTimeout(() => {
      if (!this.dragging && !this.thumb.matches(':hover')) this.thumb.classList.remove('is-visible');
    }, this.fadeDelay);
  }

  /** Reposition/size the thumb from the current scroll metrics. */
  private layout(): void {
    if (this.disposed) return;
    const m = this.source.getMetrics();
    const crect = this.container.getBoundingClientRect();
    const srect = this.scrollEl.getBoundingClientRect();
    this.scrollRect = srect;
    const g = computeThumb(m, srect.height, MIN_THUMB);
    if (!g.visible) {
      this.thumb.style.display = 'none';
      return;
    }
    this.thumb.style.display = '';
    this.thumb.style.top = `${srect.top - crect.top + g.top}px`;
    this.thumb.style.height = `${g.height}px`;
    this.thumb.style.right = `${crect.right - srect.right + INSET}px`;
  }

  private readonly onScroll = (): void => {
    this.layout();
    this.reveal();
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.dragging = true;
    this.dragStartY = e.clientY;
    this.dragStartOffset = this.source.getMetrics().offset;
    this.thumb.setPointerCapture(e.pointerId);
    this.thumb.classList.add('is-visible', 'is-dragging');
    window.clearTimeout(this.fadeTimer);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const m = this.source.getMetrics();
    const track = this.scrollRect.height;
    // Thumb top for where the drag began, plus the cursor delta, inverted to a
    // scroll offset. Recomputing the start top each move stays stable as content
    // grows mid-drag.
    const startTop = computeThumb({ ...m, offset: this.dragStartOffset }, track, MIN_THUMB).top;
    const offset = offsetForThumbTop(startTop + (e.clientY - this.dragStartY), m, track, MIN_THUMB);
    this.source.scrollToOffset(offset);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.thumb.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    this.thumb.classList.remove('is-dragging');
    this.reveal();
  };

  private readonly onThumbEnter = (): void => {
    window.clearTimeout(this.fadeTimer);
    this.thumb.classList.add('is-visible');
  };

  private readonly onThumbLeave = (): void => {
    if (!this.dragging) this.reveal();
  };

  private readonly onEdgeMove = (e: PointerEvent): void => {
    const r = this.scrollRect;
    const nearRightEdge = e.clientX >= r.right - EDGE_REVEAL && e.clientX <= r.right + INSET + 6;
    if (nearRightEdge && e.clientY >= r.top && e.clientY <= r.bottom) this.reveal();
  };

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.fadeTimer);
    this.scrollEl.removeEventListener('pointermove', this.onEdgeMove);
    for (const off of this.cleanups) off();
    this.thumb.remove();
  }
}

export function createOverlayScrollbar(opts: OverlayScrollbarOptions): OverlayScrollbar {
  return new OverlayScrollbarController(opts.container, opts.scrollEl, opts.source, opts.fadeDelay ?? 1200);
}
