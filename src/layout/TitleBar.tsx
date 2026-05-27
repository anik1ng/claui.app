import {
  IconClaudeMascot,
  IconGlobe,
  IconSplit,
  IconTerminal,
} from './Icons';
import './TitleBar.css';

interface Props {
  onOpenClaude: () => void;
  onOpenShell: () => void;
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
export function TitleBar({ onOpenClaude, onOpenShell }: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region="deep">
      <div className="titlebar-traffic-lights" aria-hidden />
      <div id="workspace-tabs-slot" className="workspace-tabs-slot" />
      <div className="titlebar-toolbar" role="toolbar" aria-label="Window actions">
        <button
          type="button"
          className="tb-icon"
          title="New Claude tab (⌘T)"
          onClick={onOpenClaude}
        >
          <IconClaudeMascot />
        </button>
        <button
          type="button"
          className="tb-icon"
          title="New terminal tab (⌘⇧T)"
          onClick={onOpenShell}
        >
          <IconTerminal />
        </button>
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
