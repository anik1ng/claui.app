// src/tabs/WorkspaceTabBar.tsx
import type { Tab } from './types';
import type { SessionInfo } from '../ipc/commands';
import { tabTitle } from './tabTitle';
import { HoverToolbar } from './HoverToolbar';
import './WorkspaceTabBar.css';

interface Props {
  tabs: Tab[];
  activeUid: string | null;
  sessions: SessionInfo[];
  onPickTab: (uid: string) => void;
  onCloseTab: (uid: string) => void;
  onOpenClaude: () => void;
  onOpenShell: () => void;
}

/**
 * 28px-tall workspace tab strip. The hover toolbar at the right end is
 * revealed via the bar's `:hover` rule (CSS-only — no React state).
 *
 * Tab order on screen matches the array order: primary at index 0 (left
 * edge), others appended right. The accent strip under the active tab is
 * a 2px `--claui-accent` bottom border — same visual language as the
 * sessions sidebar's left-edge accent for active rows.
 *
 * The `×` close button on non-primary tabs is rendered only on hover of
 * that specific tab (CSS rule on `.ws-tab:hover .ws-tab-close`). The
 * primary tab does NOT render a `×` and `Cmd+W` is a no-op on it — both
 * enforced by `isPrimary`.
 */
export function WorkspaceTabBar({
  tabs,
  activeUid,
  sessions,
  onPickTab,
  onCloseTab,
  onOpenClaude,
  onOpenShell,
}: Props) {
  return (
    <div className="ws-tab-bar">
      <div className="ws-tab-list">
        {tabs.map((tab) => {
          const active = tab.uid === activeUid;
          const glyph = tab.kind === 'claude' ? '✦' : '$';
          return (
            <div
              key={tab.uid}
              className={active ? 'ws-tab active' : 'ws-tab'}
              onClick={() => onPickTab(tab.uid)}
            >
              <span className="ws-tab-glyph" aria-hidden>
                {glyph}
              </span>
              <span className="ws-tab-title">{tabTitle(tab, sessions)}</span>
              {!tab.isPrimary && (
                <button
                  type="button"
                  className="ws-tab-close"
                  aria-label="Close tab"
                  title="Close (⌘W)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.uid);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <HoverToolbar onClaude={onOpenClaude} onTerminal={onOpenShell} />
    </div>
  );
}
