import { describe, expect, it } from 'vitest';
import { computeThumb, offsetForThumbTop, MIN_THUMB } from './overlayScrollbarGeometry';

describe('computeThumb', () => {
  it('is invisible when content fits the viewport', () => {
    expect(computeThumb({ viewport: 100, content: 100, offset: 0 }, 100).visible).toBe(false);
    expect(computeThumb({ viewport: 100, content: 80, offset: 0 }, 100).visible).toBe(false);
  });

  it('is invisible for a zero-height track or viewport', () => {
    expect(computeThumb({ viewport: 100, content: 200, offset: 0 }, 0).visible).toBe(false);
    expect(computeThumb({ viewport: 0, content: 200, offset: 0 }, 100).visible).toBe(false);
  });

  it('sizes the thumb to the viewport/content ratio', () => {
    // viewport is half the content → thumb is half the track.
    const g = computeThumb({ viewport: 100, content: 200, offset: 0 }, 300);
    expect(g.visible).toBe(true);
    expect(g.height).toBe(150);
    expect(g.top).toBe(0);
  });

  it('places the thumb at the bottom when fully scrolled', () => {
    const m = { viewport: 100, content: 200, offset: 100 }; // offset == content - viewport
    const g = computeThumb(m, 300);
    expect(g.top).toBe(300 - g.height); // flush to the track bottom
  });

  it('places the thumb mid-track at half scroll', () => {
    const m = { viewport: 100, content: 300, offset: 100 }; // maxOffset 200, half == 100
    const track = 300;
    const g = computeThumb(m, track);
    const maxTop = track - g.height;
    expect(g.top).toBeCloseTo(maxTop / 2, 5);
  });

  it('enforces the minimum thumb length for tiny ratios', () => {
    // viewport is 1% of content → raw thumb would be 2px, clamped to MIN_THUMB.
    const g = computeThumb({ viewport: 10, content: 1000, offset: 0 }, 200);
    expect(g.height).toBe(MIN_THUMB);
  });

  it('never lets the thumb overflow the track', () => {
    const m = { viewport: 10, content: 1000, offset: 990 };
    const track = 200;
    const g = computeThumb(m, track);
    expect(g.top + g.height).toBeLessThanOrEqual(track);
    expect(g.top).toBeGreaterThanOrEqual(0);
  });
});

describe('offsetForThumbTop', () => {
  const m = { viewport: 100, content: 300, offset: 0 };
  const track = 300;

  it('round-trips with computeThumb', () => {
    for (const offset of [0, 50, 100, 150, 200]) {
      const top = computeThumb({ ...m, offset }, track).top;
      expect(offsetForThumbTop(top, { ...m, offset }, track)).toBeCloseTo(offset, 5);
    }
  });

  it('clamps a thumb dragged past the top to offset 0', () => {
    expect(offsetForThumbTop(-50, m, track)).toBe(0);
  });

  it('clamps a thumb dragged past the bottom to the max offset', () => {
    expect(offsetForThumbTop(99999, m, track)).toBeCloseTo(m.content - m.viewport, 5);
  });

  it('returns 0 when there is nothing to scroll', () => {
    expect(offsetForThumbTop(50, { viewport: 100, content: 100, offset: 0 }, track)).toBe(0);
  });
});
