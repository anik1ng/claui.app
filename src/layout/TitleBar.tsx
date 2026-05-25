import {
  IconClaudeMascot,
  IconFolderOpen,
  IconGlobe,
  IconSplit,
  IconTerminal,
} from './Icons';
import './TitleBar.css';

interface Props {
  projectPath: string;
  onOpenClaude: () => void;
  onOpenShell: () => void;
  onOpenProject: () => void;
}

/** Last segment of an absolute path; falls back to the full string. */
function basename(p: string): string {
  if (!p) return p;
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf('/');
  return idx < 0 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * The claui-drawn top strip that replaces the native macOS title bar.
 *
 * Layout (left → right):
 *   - 78px reserved for macOS traffic lights (the native buttons stay
 *     overlaid here thanks to `TitleBarStyle::Overlay` in lib.rs).
 *   - Current project name (Phase 3a — single project always). Phase 3b
 *     will replace this slot with a horizontal strip of project tabs.
 *   - Right edge: a hover-revealed icon toolbar (new claude / terminal /
 *     open project, plus disabled placeholders for the later browser and
 *     split-pane phases).
 *
 * Drag region: the strip's background carries `-webkit-app-region: drag`
 * so the user can still drag the window from anywhere in this band.
 * Interactive children (the toolbar buttons) override with `no-drag`.
 */
export function TitleBar({ projectPath, onOpenClaude, onOpenShell, onOpenProject }: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-traffic-lights" aria-hidden data-tauri-drag-region />
      <div className="titlebar-project" data-tauri-drag-region>
        {basename(projectPath)}
      </div>
      <div className="titlebar-toolbar" role="toolbar" aria-label="Tab actions">
        <button
          type="button"
          className="tb-icon"
          title="Open project — replaces current (⌘O)"
          onClick={onOpenProject}
        >
          <IconFolderOpen />
        </button>
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
        <span className="tb-icon tb-disabled" title="Browser (coming later)" aria-disabled>
          <IconGlobe />
        </span>
        <span className="tb-icon tb-disabled" title="Split pane (coming later)" aria-disabled>
          <IconSplit />
        </span>
      </div>
    </div>
  );
}
