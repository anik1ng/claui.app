/**
 * Pure geometry for a macOS-style overlay scrollbar. Unit-agnostic: the inputs
 * can be pixels (a DOM scroll container) or lines (an xterm buffer) — the math
 * only deals in ratios, and the thumb is returned in track pixels.
 */

/** Scroll state in a single axis. */
export interface ScrollMetrics {
  /** Visible size of the viewport. */
  viewport: number;
  /** Total size of the scrollable content (expected >= viewport). */
  content: number;
  /** Current scroll offset, clamped to `[0, content - viewport]`. */
  offset: number;
}

/** The thumb's rendered geometry, in track pixels. */
export interface ThumbGeometry {
  /** False when the content fits the viewport — there is nothing to scroll. */
  visible: boolean;
  /** Thumb top within the track, in px. */
  top: number;
  /** Thumb height, in px. */
  height: number;
}

/** macOS keeps the thumb at a grabbable minimum length regardless of content. */
export const MIN_THUMB = 24;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Thumb height in px for the given metrics and track, honouring `minThumb`. */
function thumbHeight(m: ScrollMetrics, track: number, minThumb: number): number {
  return clamp(Math.round((track * m.viewport) / m.content), minThumb, track);
}

/**
 * Compute the thumb's pixel geometry. `track` is the scrollbar track length in
 * px. Returns `visible: false` when the content fits (no scrollbar needed) or
 * the track has no room.
 */
export function computeThumb(m: ScrollMetrics, track: number, minThumb = MIN_THUMB): ThumbGeometry {
  if (m.content <= m.viewport || m.viewport <= 0 || track <= 0) {
    return { visible: false, top: 0, height: 0 };
  }
  const height = thumbHeight(m, track, minThumb);
  const maxOffset = m.content - m.viewport;
  const maxTop = Math.max(0, track - height);
  const top = maxOffset > 0 ? clamp((m.offset / maxOffset) * maxTop, 0, maxTop) : 0;
  return { visible: true, top, height };
}

/**
 * Inverse of {@link computeThumb}: the scroll offset that places the thumb's
 * top at `thumbTop` px. Used while dragging the thumb. The returned offset is
 * clamped to `[0, content - viewport]`.
 */
export function offsetForThumbTop(
  thumbTop: number,
  m: ScrollMetrics,
  track: number,
  minThumb = MIN_THUMB,
): number {
  if (m.content <= m.viewport || track <= 0) return 0;
  const height = thumbHeight(m, track, minThumb);
  const maxTop = track - height;
  const maxOffset = m.content - m.viewport;
  if (maxTop <= 0) return 0;
  return (clamp(thumbTop, 0, maxTop) / maxTop) * maxOffset;
}
