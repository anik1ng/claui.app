// src/tabs/tabTitle.ts
import type { Tab } from './types';
import type { SessionInfo } from '../ipc/commands';

/**
 * Resolve a Tab's display title.
 * - Shell tabs always show "zsh".
 * - Claude tabs with no sessionId, or whose sessionId is not in the
 *   provided sessions list yet, show "claude".
 * - Claude tabs with a matching sessionId show the session's title.
 */
export function tabTitle(tab: Tab, sessions: SessionInfo[]): string {
  if (tab.kind === 'shell') return 'zsh';
  if (!tab.sessionId) return 'claude';
  const match = sessions.find((s) => s.id === tab.sessionId);
  return match?.title ?? 'claude';
}
