// src/tabs/openSessionIds.ts
import type { Tab } from './types';

/**
 * The set of sessionIds currently held by some claude tab.
 * Used by the sessions sidebar to (a) mark rows as already open and
 * (b) route clicks: in-set → focus that tab; out-of-set → open new tab.
 */
export function openSessionIds(tabs: Tab[]): Set<string> {
  const out = new Set<string>();
  for (const t of tabs) {
    if (t.kind === 'claude' && t.sessionId) out.add(t.sessionId);
  }
  return out;
}
