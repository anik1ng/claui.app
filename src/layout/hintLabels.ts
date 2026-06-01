/**
 * Per-item digit to display in the held-modifier shortcut HUD, mirroring the
 * `1..8` index / `9` = last keybinding.
 *
 *  - count <= 8 → [1, 2, …, count]
 *  - count > 8  → [1..8, null, …, null, 9]  (first eight indexed; the last
 *    item gets 9; the middle ones are unreachable by a single digit → null)
 */
export function hintLabels(count: number): (number | null)[] {
  if (count <= 0) return [];
  if (count <= 8) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | null)[] = Array.from({ length: count }, () => null);
  for (let i = 0; i < 8; i++) out[i] = i + 1;
  out[count - 1] = 9;
  return out;
}
