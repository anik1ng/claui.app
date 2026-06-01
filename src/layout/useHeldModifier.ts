import { useEffect, useState } from 'react';

export type HeldModifier = 'ctrl' | 'meta' | null;

const modOf = (e: KeyboardEvent): HeldModifier =>
  e.key === 'Control' ? 'ctrl' : e.key === 'Meta' ? 'meta' : null;

/**
 * Install capture-phase window listeners that drive the shortcut HUD:
 *
 * - lone Control/Meta keydown (no other modifier) → start a `delayMs` timer;
 *   on fire (still down) → `onChange('ctrl' | 'meta')`.
 * - a non-modifier keydown while the timer is PENDING cancels it — a combo
 *   like Cmd+T is in progress, so the HUD never flashes.
 * - once shown, other keydowns do NOT hide it (modifier still down) so the
 *   user can press 1/2/3 in a row.
 * - keyup of the shown modifier, or window blur → `onChange(null)`.
 *
 * Capture phase so xterm.js never swallows the events. Returns a teardown fn.
 */
function watchHeldModifier(delayMs: number, onChange: (m: HeldModifier) => void): () => void {
  let timer: number | null = null;
  let shown: HeldModifier = null;
  const clearTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  const reset = () => {
    clearTimer();
    if (shown !== null) {
      shown = null;
      onChange(null);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const mod = modOf(e);
    if (!mod) {
      clearTimer(); // a non-modifier key cancels a pending (not-yet-shown) reveal
      return;
    }
    if (timer !== null || shown !== null) return;
    if (e.altKey || e.shiftKey || (mod === 'ctrl' ? e.metaKey : e.ctrlKey)) return;
    timer = window.setTimeout(() => {
      timer = null;
      shown = mod;
      onChange(mod);
    }, delayMs);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const mod = modOf(e);
    if (mod && (timer !== null || shown === mod)) reset();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', reset);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', reset);
    clearTimer();
  };
}

/**
 * Returns the deliberately-held modifier (`'ctrl' | 'meta'`) for the shortcut
 * HUD, or null. See `watchHeldModifier` for the timing rules.
 */
export function useHeldModifier(delayMs = 350): HeldModifier {
  const [held, setHeld] = useState<HeldModifier>(null);
  useEffect(() => watchHeldModifier(delayMs, setHeld), [delayMs]);
  return held;
}
