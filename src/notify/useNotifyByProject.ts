import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotifyUpdate } from '../ipc/commands';
import { useListen } from './useListen';
import {
  clearNotify,
  clearOsNotified,
  decideOsNotify,
  isSuppressed,
  setNotify,
  type NotifyMap,
  type OsNotified,
  type Viewed,
} from './notifyStore';
import { ensureActivationHandler, notifyOs } from './osNotification';

export interface UseNotify {
  /** projectId → (tabId → kind). */
  byProject: NotifyMap;
  /** Mark a tab as the one being viewed, and clear its pending signal. */
  markViewed: (projectId: string, tabId: string) => void;
  /** Drop a tab's signal (tab closed). */
  clear: (projectId: string, tabId: string) => void;
  /** Window gained focus — clear the viewed tab. */
  onFocus: () => void;
  /** Window lost focus. */
  onBlur: () => void;
}

/**
 * Aggregates `notify:update` events into a `Map<projectId, Map<tabId, kind>>`.
 * Suppresses a signal for the tab currently being viewed while the window is
 * focused (see `isSuppressed`) — you never get a dot on what you're looking at.
 * Viewed-tab + focus state live in refs so the single event listener reads the
 * latest without re-subscribing.
 * `getProjectName` is read via a ref on every event, so callers need not
 * memoize it. The hook also raises OS notifications for unfocused actionable
 * events (attention / error) via `notifyOs`.
 */
export function useNotifyByProject(getProjectName: (id: string) => string): UseNotify {
  const [byProject, setByProject] = useState<NotifyMap>(new Map());
  const viewedRef = useRef<Viewed | null>(null);
  const focusedRef = useRef<boolean>(document.hasFocus());
  const osNotifiedRef = useRef<OsNotified>(new Map());
  const getNameRef = useRef(getProjectName);
  getNameRef.current = getProjectName;

  useEffect(() => {
    ensureActivationHandler();
  }, []);

  useListen<NotifyUpdate>('notify:update', (e) => {
    const { projectId, tabId, kind } = e.payload;
    if (isSuppressed(viewedRef.current, focusedRef.current, projectId, tabId)) {
      return;
    }
    setByProject((prev) => setNotify(prev, projectId, tabId, kind));
    const decision = decideOsNotify(osNotifiedRef.current, projectId, kind, focusedRef.current);
    osNotifiedRef.current = decision.next;
    if (decision.notify) {
      void notifyOs(getNameRef.current(projectId), kind, projectId, tabId);
    }
  });

  const clear = useCallback((projectId: string, tabId: string) => {
    setByProject((prev) => clearNotify(prev, projectId, tabId));
  }, []);

  const markViewed = useCallback(
    (projectId: string, tabId: string) => {
      viewedRef.current = { projectId, tabId };
      osNotifiedRef.current = clearOsNotified(osNotifiedRef.current, projectId);
      clear(projectId, tabId);
    },
    [clear],
  );

  const onFocus = useCallback(() => {
    focusedRef.current = true;
    const v = viewedRef.current;
    if (v) {
      osNotifiedRef.current = clearOsNotified(osNotifiedRef.current, v.projectId);
      clear(v.projectId, v.tabId);
    }
  }, [clear]);

  const onBlur = useCallback(() => {
    focusedRef.current = false;
  }, []);

  return { byProject, markViewed, clear, onFocus, onBlur };
}
