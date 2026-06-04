import { useEffect, useRef } from 'react';
import { cleanupTabNotify, cleanupTabStatus } from '../ipc/commands';
import type { Tab } from '../tabs/types';

/**
 * Remove each claude tab's status/notify temp files when the project's
 * ProjectArea unmounts (project closed via Cmd+Shift+W). Per-tab files are
 * otherwise only cleaned on explicit tab close; without this, closing a project
 * leaves its tabs' status-<tabId>.json / notify-<tabId>.json behind until the
 * next startup purge. A ref holds the live tab list so the unmount cleanup sees
 * the tabs that existed at close time. (App quit via Cmd+Q still relies on the
 * startup purge — React effect cleanups don't run when the process is killed.)
 */
export function useProjectCloseCleanup(tabs: Tab[]): void {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
    return () => {
      for (const tab of tabsRef.current) {
        if (tab.kind !== 'claude') continue;
        void cleanupTabStatus(tab.uid);
        void cleanupTabNotify(tab.uid);
      }
    };
  }, []);
}
