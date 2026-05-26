// src/sessions/useSessionsPolling.ts
import { useEffect, useState } from 'react';
import { listSessions, type SessionInfo } from '../ipc/commands';

/**
 * Poll the project's sessions list every 2 seconds. Refetches immediately
 * on `projectPath` change OR when `refetchKey` changes — pass the active
 * session id as the key so a fresh session (or session switch) triggers
 * an immediate re-fetch rather than waiting up to 2s for the next tick.
 * The polling is hoisted out of `Sidebar` so both the sidebar and the
 * workspace tab bar (for titles) can share one source of truth.
 */
export function useSessionsPolling(
  projectPath: string,
  refetchKey?: unknown,
): SessionInfo[] {
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
  }, [projectPath, refetchKey]);

  return sessions;
}
