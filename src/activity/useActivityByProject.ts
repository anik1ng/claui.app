import { useCallback, useState } from 'react';
import type { ActivityUpdate } from '../ipc/commands';
import { useListen } from '../notify/useListen';
import { aggregateActivity, type ActivityMap } from './activityStore';

export interface UseActivity {
  /** projectId → set of working tabIds. */
  byProject: ActivityMap;
  /** Drop a tab's working state (tab closed). The Rust `Stop` hook never fires
   *  on a killed PTY, so the webview must clear the entry itself — otherwise a
   *  tab closed mid-work leaves a phantom "working" on its project row. */
  clear: (projectId: string, tabId: string) => void;
}

/**
 * Aggregates `activity:update` events into `Map<projectId, Set<tabId>>` (the
 * working tabs). Mirrors `useStatusByProject` / `useNotifyByProject`: one global
 * listener, referential stability via `aggregateActivity` so a tick on one tab
 * never re-renders unrelated projects.
 */
export function useActivityByProject(): UseActivity {
  const [byProject, setByProject] = useState<ActivityMap>(new Map());
  useListen<ActivityUpdate>('activity:update', (e) => {
    setByProject((prev) => aggregateActivity(prev, e.payload));
  });
  const clear = useCallback((projectId: string, tabId: string) => {
    setByProject((prev) => aggregateActivity(prev, { projectId, tabId, state: 'idle' }));
  }, []);
  return { byProject, clear };
}
