import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ptyInput } from '../ipc/commands';
import { formatDroppedPaths } from './dropPaths';
import { getActivePty } from './activePty';

/**
 * Window-level handler for OS file drops. The Tauri drag-drop handler is
 * enabled (see lib.rs), so dropping files emits `tauri://drag-drop` with their
 * absolute paths and suppresses WKWebView's default "navigate to the dropped
 * file" behaviour. We type the paths into the focused terminal's PTY. No-op if
 * no terminal is focused or the payload has no paths.
 */
export function useFileDrop(): void {
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      const id = getActivePty();
      if (id == null) return;
      const text = formatDroppedPaths(event.payload.paths ?? []);
      if (text) void ptyInput(id, text);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
}
