import {
  IconClaudeMascot,
  IconGlobe,
  IconSplit,
  IconTerminal,
} from './Icons';
import './TitleBar.css';

interface Props {
  /** Callback ref for the workspace-tabs portal target. App tracks this via
   *  `useState`, so a remount (e.g. via TitleBar conditional rendering — not
   *  currently done — would still feed the fresh DOM node into `ProjectArea`. */
  workspaceTabsRef: (el: HTMLElement | null) => void;
  /** Whether to render the new-claude / new-shell toolbar buttons. False when
   *  no projects are open — the buttons would emit menu events into a webview
   *  with no listeners (no `ProjectArea` mounted) and silently do nothing. */
  showTabActions: boolean;
  onOpenClaude: () => void;
  onOpenShell: () => void;
  /** Title shown centered when no project is open (no `ProjectArea` is mounted
   *  to portal its tabs/name into the slot). Once a project opens, its
   *  `WorkspaceTabBar` fills the slot instead and this is undefined. */
  emptyTitle?: string;
}

/**
 * The 32px strip at the top of the window. Left ~78px is reserved for the
 * macOS traffic lights (still overlaid here via `TitleBarStyle::Overlay` in
 * lib.rs). The centre hosts the workspace tab strip — the active
 * `<ProjectArea>` portals its `<WorkspaceTabBar>` into
 * `#workspace-tabs-slot` so only one project's tabs are ever live. Right
 * end is a hover-revealed icon toolbar.
 *
 * Drag region: outer `data-tauri-drag-region="deep"` lets background drag
 * work for any non-interactive child. The CSS-side `-webkit-app-region`
 * cooperates (see TitleBar.css for the matching no-drag overrides on
 * buttons and the workspace tabs).
 */
export function TitleBar({
  workspaceTabsRef,
  showTabActions,
  onOpenClaude,
  onOpenShell,
  emptyTitle,
}: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebar-traffic-lights" aria-hidden />
      <div ref={workspaceTabsRef} className="workspace-tabs-slot">
        {emptyTitle && <div className="titlebar-heading">{emptyTitle}</div>}
      </div>
      <div className="titlebar-toolbar" role="toolbar" aria-label="Window actions">
        {showTabActions && (
          <>
            <button
              type="button"
              className="tb-icon"
              title="New Claude tab (⌘⇧T)"
              onClick={onOpenClaude}
            >
              <IconClaudeMascot />
            </button>
            <button
              type="button"
              className="tb-icon"
              title="New terminal tab (⌘T)"
              onClick={onOpenShell}
            >
              <IconTerminal />
            </button>
          </>
        )}
        <span
          className="tb-icon tb-disabled"
          title="Browser (coming later)"
          aria-disabled
          data-tauri-drag-region="false"
        >
          <IconGlobe />
        </span>
        <span
          className="tb-icon tb-disabled"
          title="Split pane (coming later)"
          aria-disabled
          data-tauri-drag-region="false"
        >
          <IconSplit />
        </span>
      </div>
    </div>
  );
}
