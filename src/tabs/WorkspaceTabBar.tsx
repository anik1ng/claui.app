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
  onOpenProject: () => void;
}

/**
 * 28px-tall workspace ribbon at the top of the window. Always rendered —
 * the toolbar at the right end is the only mouse affordance for creating
 * new tabs and switching projects, so it must stay visible.
 *
 * The tab strip on the left is conditional: it renders only when at least
 * two tabs exist (a single primary needs no switcher). The toolbar fills
 * the right end in both modes.
 *
 * Active tab styling: a 2px `--claui-accent` bottom border — same visual
 * language as the sessions sidebar's left-edge accent for active rows.
 * The `×` close button on non-primary tabs is revealed on per-tab hover
 * (CSS rule on `.ws-tab:hover .ws-tab-close`). The primary tab does NOT
 * render a `×` and ⌘W (via the File menu) is a no-op on it — both
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
  onOpenProject,
}: Props) {
  const showStrip = tabs.length >= 2;
  return (
    <div className="ws-tab-bar">
      {showStrip ? (
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
      ) : (
        <div className="ws-tab-spacer" />
      )}
      <HoverToolbar
        onClaude={onOpenClaude}
        onTerminal={onOpenShell}
        onOpenProject={onOpenProject}
      />
    </div>
  );
}
