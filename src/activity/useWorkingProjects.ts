import { useMemo, useRef } from 'react';
import { workingProjects, type ActivityMap } from './activityStore';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Content-stabilised set of working projectIds. `aggregateActivity` hands out a
 * new outer map on every activity tick, but the per-project membership often
 * doesn't change (e.g. a second tab of an already-working project). Returning
 * the prior set when the keys match lets `memo(ProjectsSection)` skip those ticks.
 */
export function useWorkingProjects(activity: ActivityMap): ReadonlySet<string> {
  const prevRef = useRef<ReadonlySet<string>>(EMPTY);
  return useMemo(() => {
    const next = workingProjects(activity);
    const prev = prevRef.current;
    if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
    prevRef.current = next;
    return next;
  }, [activity]);
}
