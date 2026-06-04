import { useState } from 'react';
import type { StatusPayload, StatusUpdate } from '../ipc/commands';
import { useListen } from '../notify/useListen';

/** projectId → (tabId → payload). */
export type StatusByProject = Map<string, Map<string, StatusPayload>>;

function statusEqual(a: StatusPayload, b: StatusPayload): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.model === b.model &&
    a.contextPct === b.contextPct &&
    a.costUsd === b.costUsd &&
    a.fiveHourPct === b.fiveHourPct &&
    a.fiveHourResetsAt === b.fiveHourResetsAt &&
    a.sevenDayPct === b.sevenDayPct &&
    a.sevenDayResetsAt === b.sevenDayResetsAt
  );
}

/**
 * Fold one `status:update` into the nested map. Returns the SAME map reference
 * when the payload is content-identical to what's already stored for that
 * (project, tab) — so React.memo can skip. On a real change, only the touched
 * project's inner map gets a new reference; sibling projects keep identity.
 */
export function aggregateStatus(prev: StatusByProject, u: StatusUpdate): StatusByProject {
  const inner = prev.get(u.projectId);
  const existing = inner?.get(u.tabId);
  if (existing && statusEqual(existing, u.status)) return prev;
  const next = new Map(prev);
  const nextInner = new Map(inner ?? []);
  nextInner.set(u.tabId, u.status);
  next.set(u.projectId, nextInner);
  return next;
}

/**
 * Aggregates per-tab statusline payloads delivered via the global
 * `status:update` event into `Map<projectId, Map<tabId, StatusPayload>>`.
 * Each `ProjectArea` reads its project's inner map and selects the active
 * tab's payload. Referential stability (see `aggregateStatus`) keeps React.memo
 * effective so one tab's tick never re-renders unrelated projects.
 */
export function useStatusByProject(): StatusByProject {
  const [statuses, setStatuses] = useState<StatusByProject>(new Map());
  useListen<StatusUpdate>('status:update', (e) => {
    setStatuses((prev) => aggregateStatus(prev, e.payload));
  });
  return statuses;
}
