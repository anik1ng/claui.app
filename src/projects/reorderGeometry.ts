/**
 * The index the dragged row should land at — its final index in the array
 * AFTER the dragged item is removed. Counts how many non-dragged rows have
 * their (drag-start) vertical midpoint above the pointer.
 *
 * @param pointerY  current pointer Y in viewport coords
 * @param midpoints each row's vertical midpoint, in list order, measured once
 *                  at drag start (stable while the pointer moves)
 * @param draggedIndex the index being dragged (excluded from the count)
 */
export function targetIndex(pointerY: number, midpoints: number[], draggedIndex: number): number {
  let idx = 0;
  for (let i = 0; i < midpoints.length; i++) {
    if (i === draggedIndex) continue;
    if (pointerY > midpoints[i]) idx++;
  }
  return idx;
}

/**
 * Vertical pixel shift to apply to a NON-dragged row so it visually slides to
 * open the gap at `target`. `source` is the dragged row's original index,
 * `target` its final index (after removal). Returns 0 for the dragged row.
 */
export function rowShift(i: number, source: number, target: number, rowHeight: number): number {
  if (i === source) return 0;
  const r = i < source ? i : i - 1; // position in the array with the dragged item removed
  const newSlot = r < target ? r : r + 1; // slot after re-inserting the dragged item at `target`
  return (newSlot - i) * rowHeight;
}
