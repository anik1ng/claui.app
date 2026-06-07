export const MIN_WIDTH = 180;
export const MAX_WIDTH = 520;
export const DEFAULT_WIDTH = 232;
const STORAGE_KEY = 'claui:sidebarWidth';

/** Clamp a width to the allowed range. NaN/Infinity fall back to the default. */
export function clampSidebarWidth(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

/** Read the persisted width (clamped). Missing / non-numeric → default. */
export function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_WIDTH;
    return clampSidebarWidth(parseFloat(raw));
  } catch {
    return DEFAULT_WIDTH;
  }
}

/** Persist the width (clamped). Best-effort — storage failures are ignored. */
export function saveSidebarWidth(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampSidebarWidth(n)));
  } catch {
    // localStorage unavailable (private mode / quota) — width just won't persist.
  }
}
