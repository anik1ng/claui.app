// src/tabs/WorkspaceTabBar.tsx
import type { Tab } from './types';
import type { SessionInfo } from '../ipc/commands';
import { IconClaudeMascot, IconTerminal } from '../layout/Icons';
import { hintLabels } from '../layout/hintLabels';
import { tabTitle } from './tabTitle';
import type { NotifyKind } from '../notify/notifyStore';
import './WorkspaceTabBar.css';

interface Props {
  tabs: Tab[];
  activeUid: string | null;
  sessions: SessionInfo[];
  onPickTab: (uid: string) => void;
  onCloseTab: (uid: string) => void;
  /** When true (App: Ctrl held), show a `⌃N` hint badge on each tab. */
  showShortcuts: boolean;
  /** Shown centered in the title bar when there's no tab switcher (a single
   *  tab) — the active project's name, acting as the window title. */
  projectName: string;
  /** tabId → kind for this project's tabs. */
  notify: ReadonlyMap<string, NotifyKind>;
}

/**
 * 28px-tall workspace tab strip. The switcher only makes sense with at
 * least two tabs; with a single tab it instead renders the active project's
 * name centered, so the title bar reads as a window title rather than empty
 * space. The "new tab" toolbar lives in `TitleBar` (always present), not here.
 *
 * Active tab styling: background highlight only (no accent border).
 * Every tab has an always-present 2px bottom underline that transitions
 * through rest → done → attention → error colours via CSS `::after`.
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
  showShortcuts,
  projectName,
  notify,
}: Props) {
  if (tabs.length < 2) {
    const soleKind = tabs[0] ? notify.get(tabs[0].uid) : undefined;
    return (
      <div className="titlebar-heading">
        {soleKind && <span className={`ws-heading-bar notify-${soleKind}`} aria-hidden />}
        {projectName}
      </div>
    );
  }
  const labels = hintLabels(tabs.length);
  return (
    <div className="ws-tab-bar">
      <div className="ws-tab-list">
        {tabs.map((tab, i) => {
          const active = tab.uid === activeUid;
          const kind = notify.get(tab.uid);
          const cls = `ws-tab${active ? ' active' : ''}${kind ? ` notify-${kind}` : ''}`;
          return (
            <div key={tab.uid} className={cls} onClick={() => onPickTab(tab.uid)}>
              <span className="ws-tab-glyph" aria-hidden>
                {tab.kind === 'claude' ? <IconClaudeMascot /> : <IconTerminal />}
              </span>
              <span className="ws-tab-title">{tabTitle(tab, sessions)}</span>
              {/* Fixed-width tail: the shortcut badge takes the SAME slot as the
                  close button (no layout shift when the HUD toggles), and the
                  primary tab — which has no × — still reserves the slot. */}
              <span className="ws-tab-tail">
                {showShortcuts && labels[i] != null ? (
                  <span className="ws-tab-hint" aria-hidden>⌘{labels[i]}</span>
                ) : !tab.isPrimary ? (
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
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
