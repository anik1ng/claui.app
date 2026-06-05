import { describe, it, expect } from 'vitest';
import { targetIndex, rowShift } from './reorderGeometry';

// Four rows, 30px tall, tops at 0/30/60/90 → midpoints 15/45/75/105.
const mids = [15, 45, 75, 105];

describe('targetIndex', () => {
  it('pointer above all rows → 0', () => {
    expect(targetIndex(5, mids, 1)).toBe(0);
  });

  it('pointer below all rows → last index', () => {
    expect(targetIndex(200, mids, 1)).toBe(3);
  });

  it('ignores the dragged row when counting', () => {
    // Dragging index 1 (B). Pointer at y=50 sits below A(15), above C(75)/D(105).
    // Only A counts → target 1 (B stays put among [A,C,D]).
    expect(targetIndex(50, mids, 1)).toBe(1);
  });

  it('pointer past C midpoint moves B after C', () => {
    // y=80 is below A(15) and C(75), above D(105) → A,C count → 2.
    expect(targetIndex(80, mids, 1)).toBe(2);
  });
});

describe('rowShift', () => {
  const H = 30;
  // Dragging source s=1 (B), target t=2 → final [A,C,B,D].
  it('row before the gap does not move (A)', () => {
    expect(rowShift(0, 1, 2, H)).toBe(0);
  });
  it('row pulled up into the gap (C)', () => {
    expect(rowShift(2, 1, 2, H)).toBe(-H);
  });
  it('row after the gap stays (D)', () => {
    expect(rowShift(3, 1, 2, H)).toBe(0);
  });
  it('moving up shifts the displaced row down', () => {
    // s=1, t=0 → final [B,A,C,D]; A (i=0) moves down one row.
    expect(rowShift(0, 1, 0, H)).toBe(H);
  });
  it('the dragged row itself returns 0', () => {
    expect(rowShift(1, 1, 2, H)).toBe(0);
  });
});
