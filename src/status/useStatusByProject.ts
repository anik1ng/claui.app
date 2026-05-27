import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { StatusPayload, StatusUpdate } from '../ipc/commands';

function statusEqual(a: StatusPayload, b: StatusPayload): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.model === b.model &&
    a.contextPct === b.contextPct &&
    a.costUsd === b.costUsd &&
    a.fiveHourPct === b.fiveHourPct &&
    a.sevenDayPct === b.sevenDayPct
  );
}

/**
 * Aggregates per-project statusline payloads delivered via the global
 * `status:update` event into a Map keyed by projectId. Each `ProjectArea`
 * reads its own slice from the returned map; the Rust watcher emits one
 * event per primary claude's status-<id>.json file.
 *
 * Belt-and-suspenders dedupe: even if Rust emits a payload whose fields
 * exactly match the previous one for the same project, we keep the existing
 * Map identity so React.memo can skip the entire ProjectArea sub-tree.
 */
export function useStatusByProject(): Map<string, StatusPayload> {
  const [statuses, setStatuses] = useState<Map<string, StatusPayload>>(new Map());

  useEffect(() => {
    const unlisten = listen<StatusUpdate>('status:update', (e) => {
      setStatuses((prev) => {
        const existing = prev.get(e.payload.projectId);
        if (existing && statusEqual(existing, e.payload.status)) {
          return prev;
        }
        const next = new Map(prev);
        next.set(e.payload.projectId, e.payload.status);
        return next;
      });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return statuses;
}
