export type NotifyKind = 'done' | 'attention' | 'error';

/** projectId → (tabId → kind). */
export type NotifyMap = Map<string, Map<string, NotifyKind>>;

export interface Viewed {
  projectId: string;
  tabId: string;
}

const SEVERITY: Record<NotifyKind, number> = { done: 1, attention: 2, error: 3 };

/** Worst (highest-severity) kind in the list, or null if empty. */
export function worstKind(kinds: NotifyKind[]): NotifyKind | null {
  let worst: NotifyKind | null = null;
  for (const k of kinds) {
    if (worst === null || SEVERITY[k] > SEVERITY[worst]) worst = k;
  }
  return worst;
}

/** Immutably set `projectId/tabId → kind`. Only the changed project's inner
 *  Map gets a new reference, so React.memo on sibling projects still holds.
 *  Returns the same reference when the kind is already set to that value. */
export function setNotify(
  prev: NotifyMap,
  projectId: string,
  tabId: string,
  kind: NotifyKind,
): NotifyMap {
  if (prev.get(projectId)?.get(tabId) === kind) return prev;
  const next = new Map(prev);
  const inner = new Map(prev.get(projectId) ?? []);
  inner.set(tabId, kind);
  next.set(projectId, inner);
  return next;
}

/** Immutably clear `projectId/tabId`. Drops the project when it becomes empty.
 *  Returns the same reference when nothing matched (lets callers skip setState). */
export function clearNotify(prev: NotifyMap, projectId: string, tabId: string): NotifyMap {
  const inner = prev.get(projectId);
  if (!inner || !inner.has(tabId)) return prev;
  const next = new Map(prev);
  const nextInner = new Map(inner);
  nextInner.delete(tabId);
  if (nextInner.size === 0) next.delete(projectId);
  else next.set(projectId, nextInner);
  return next;
}

/** True when the event targets the tab the user is already looking at AND the
 *  window is focused — that signal is pointless, so we drop it. */
export function isSuppressed(
  viewed: Viewed | null,
  focused: boolean,
  projectId: string,
  tabId: string,
): boolean {
  return (
    focused &&
    viewed !== null &&
    viewed.projectId === projectId &&
    viewed.tabId === tabId
  );
}

/** Reduce each project to its worst kind — the colour of its sidebar strip. */
export function projectAggregate(map: NotifyMap): Map<string, NotifyKind> {
  const out = new Map<string, NotifyKind>();
  for (const [projectId, inner] of map) {
    const worst = worstKind([...inner.values()]);
    if (worst) out.set(projectId, worst);
  }
  return out;
}

/** projectId → the actionable severity we've already raised an OS banner for. */
export type OsNotified = Map<string, NotifyKind>;

export interface OsDecision {
  notify: boolean;
  next: OsNotified;
}

/**
 * Decide whether an incoming event should raise a system notification, and
 * return the updated bookkeeping. Rules: only when the window is unfocused;
 * only for actionable kinds (attention/error, never done); one per state-entry
 * per project; a transition to a higher severity re-notifies (escalation), a
 * lower/equal severity does not.
 */
export function decideOsNotify(
  prev: OsNotified,
  projectId: string,
  kind: NotifyKind,
  windowFocused: boolean,
): OsDecision {
  if (windowFocused || kind === 'done') return { notify: false, next: prev };
  const current = prev.get(projectId);
  if (current !== undefined && SEVERITY[kind] <= SEVERITY[current]) {
    return { notify: false, next: prev };
  }
  const next = new Map(prev);
  next.set(projectId, kind);
  return { notify: true, next };
}

/** Reset a project's OS-notify bookkeeping (on view), so re-entry notifies. */
export function clearOsNotified(prev: OsNotified, projectId: string): OsNotified {
  if (!prev.has(projectId)) return prev;
  const next = new Map(prev);
  next.delete(projectId);
  return next;
}
