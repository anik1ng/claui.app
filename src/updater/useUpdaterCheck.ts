import { useCallback, useEffect, useRef, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Toast state surfaced by {@link useUpdaterCheck}. `null` means nothing is
 * shown. The transient `up-to-date` / `error` variants are only ever set by an
 * *explicit* (menu-triggered) check — the silent startup check stays quiet
 * unless it actually finds an update.
 */
export type UpdaterToast =
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'installing' }
  | { kind: 'up-to-date' }
  | { kind: 'error'; message: string }
  | null;

/**
 * Delay before the silent startup check. Cold start is busy spawning PTYs and
 * painting the first frame; a network round-trip to GitHub has no business
 * competing with that, so we wait until the window has settled.
 */
const STARTUP_DELAY_MS = 5_000;

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/**
 * Owns the in-app updater lifecycle for the whole window. Mount once at the App
 * level. Runs a silent check {@link STARTUP_DELAY_MS} after mount, exposes
 * `checkForUpdates()` for the menu's explicit "Check for Updates…" command, and
 * carries the live {@link Update} handle (in a ref, since it is not serialisable
 * React state) so `install()` can download + relaunch on the user's click.
 */
export function useUpdaterCheck() {
  const [toast, setToast] = useState<UpdaterToast>(null);
  const updateRef = useRef<Update | null>(null);
  // Guards against overlapping checks: a slow startup check still in flight
  // when the user hits the menu, or repeated menu clicks.
  const inFlightRef = useRef(false);

  const runCheck = useCallback(async (explicit: boolean) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setToast({ kind: 'available', version: update.version, notes: update.body ?? '' });
      } else if (explicit) {
        setToast({ kind: 'up-to-date' });
      }
    } catch (err) {
      // A silent check that can't reach GitHub must not nag the user; an
      // explicit one asked for an answer, so surface the failure.
      if (explicit) setToast({ kind: 'error', message: message(err) });
      else console.warn('updater: silent check failed:', err);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setToast({ kind: 'installing' });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setToast({ kind: 'error', message: message(err) });
    }
  }, []);

  const checkForUpdates = useCallback(() => void runCheck(true), [runCheck]);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const t = setTimeout(() => void runCheck(false), STARTUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [runCheck]);

  return { toast, checkForUpdates, install, dismiss };
}
