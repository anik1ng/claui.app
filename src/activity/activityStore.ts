import type { ActivityUpdate } from '../ipc/commands';

/** projectId → set of tabIds whose Claude is currently working. A project is
 *  absent from the outer map when none of its tabs are working. */
export type ActivityMap = Map<string, Set<string>>;

/**
 * Fold one `activity:update` into the nested map. Returns the SAME reference
 * when the state already matches (so React.memo can skip). On a real change,
 * only the touched project's inner set gets a new reference; siblings keep
 * identity. `idle` clears the tab and drops the project when it empties.
 */
export function aggregateActivity(prev: ActivityMap, u: ActivityUpdate): ActivityMap {
  const inner = prev.get(u.projectId);
  const isWorking = inner?.has(u.tabId) ?? false;
  if (u.state === 'working') {
    if (isWorking) return prev;
    const next = new Map(prev);
    const nextInner = new Set(inner ?? []);
    nextInner.add(u.tabId);
    next.set(u.projectId, nextInner);
    return next;
  }
  // idle
  if (!isWorking) return prev;
  const next = new Map(prev);
  const nextInner = new Set(inner);
  nextInner.delete(u.tabId);
  if (nextInner.size === 0) next.delete(u.projectId);
  else next.set(u.projectId, nextInner);
  return next;
}

/** The set of projectIds with at least one working tab (the outer map's keys,
 *  since empty projects are dropped). */
export function workingProjects(map: ActivityMap): Set<string> {
  return new Set(map.keys());
}
