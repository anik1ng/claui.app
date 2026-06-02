import { useCallback, useEffect } from 'react';
import { cleanupTabNotify } from '../ipc/commands';
import { useListen } from './useListen';

interface Params {
  projectId: string;
  isActive: boolean;
  activeUid: string | null;
  closeTab: (uid: string) => void;
  onViewActiveTab: (projectId: string, tabId: string) => void;
  onClearTabNotify: (projectId: string, tabId: string) => void;
}

/** Select a tab when the `notify:activate` event targets this project.
 *  Not gated on `isActive` — the project may not be active yet when the
 *  event fires (App switches the project first in its own listener). */
export function useNotifyActivateTab(
  projectId: string,
  selectTab: (uid: string) => void,
): void {
  useListen<{ projectId: string; tabId: string }>('notify:activate', (e) => {
    if (e.payload.projectId === projectId) selectTab(e.payload.tabId);
  });
}

/**
 * Per-project notification wiring for a ProjectArea: reports the active tab as
 * "viewed" (clearing its signal) whenever this project/tab is shown, and
 * returns a `closeTab` wrapper that also drops the closed tab's signal +
 * removes its temp file. Extracted to keep ProjectArea under the lint limit.
 */
export function useTabNotify({
  projectId,
  isActive,
  activeUid,
  closeTab,
  onViewActiveTab,
  onClearTabNotify,
}: Params): (uid: string) => void {
  useEffect(() => {
    if (isActive && activeUid) onViewActiveTab(projectId, activeUid);
  }, [isActive, activeUid, projectId, onViewActiveTab]);

  return useCallback(
    (uid: string) => {
      closeTab(uid);
      onClearTabNotify(projectId, uid);
      void cleanupTabNotify(uid);
    },
    [closeTab, onClearTabNotify, projectId],
  );
}
