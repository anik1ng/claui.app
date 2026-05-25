// src/sessions/useSessionsPolling.ts
import { useEffect, useState } from 'react';
import { listSessions, type SessionInfo } from '../ipc/commands';

/**
 * Poll the project's sessions list every 2 seconds. Refetches immediately
 * on `projectPath` change. The polling is hoisted out of `Sidebar` so
 * both the sidebar and the workspace tab bar (for titles) can share one
 * source of truth.
 */
export function useSessionsPolling(projectPath: string): SessionInfo[] {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void listSessions(projectPath).then((list) => {
        if (!cancelled) setSessions(list);
      });
    };
    refetch();
    const interval = window.setInterval(refetch, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [projectPath]);

  return sessions;
}
