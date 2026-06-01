import { describe, it, expect } from 'vitest';
import { hintLabels } from './hintLabels';

describe('hintLabels', () => {
  it('empty list → []', () => {
    expect(hintLabels(0)).toEqual([]);
  });

  it('count <= 8 → 1..count', () => {
    expect(hintLabels(3)).toEqual([1, 2, 3]);
    expect(hintLabels(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('count > 8 → 1..8, nulls, 9 on the last', () => {
    expect(hintLabels(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, null, 9]);
  });
});
