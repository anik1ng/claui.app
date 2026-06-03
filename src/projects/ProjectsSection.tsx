import type { ProjectEntry } from '../ipc/commands';
import type { NotifyKind } from '../notify/notifyStore';
import { ListRow } from '../sessions/ListRow';
import { hintLabels } from '../layout/hintLabels';
import { useOverlayScrollbar } from '../scroll/useOverlayScrollbar';
import { basename } from './basename';

interface Props {
  projects: ProjectEntry[];
  activeId: string | null;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  /** When true (App: Cmd held), show a `⌘N` hint badge on each project row. */
  showShortcuts: boolean;
  /** projectId → worst kind, for the row dot. */
  indicators: Map<string, NotifyKind>;
}

/**
 * Top half of the right sidebar — the list of open projects. Renders nothing
 * when there's only one project (no choice to surface). Uses the same
 * `<ListRow>` as the sessions section below so the two read as one unified
 * navigation panel.
 */
export function ProjectsSection({ projects, activeId, onPick, onClose, onAdd, showShortcuts, indicators }: Props) {
  const listRef = useOverlayScrollbar(projects.length);
  if (projects.length < 2) return null;
  const labels = hintLabels(projects.length);
  return (
    <>
      <div className="sidebar-header">
        <span>PROJECTS</span>
        <button type="button" className="sidebar-new" onClick={onAdd}>
          + Add
        </button>
      </div>
      <div className="sidebar-list" ref={listRef}>
        {projects.map((p, i) => (
          <ListRow
            key={p.id}
            label={basename(p.path)}
            isActive={p.id === activeId}
            title={p.path}
            indicator={indicators.get(p.id) ?? 'none'}
            onClick={() => onPick(p.id)}
            onClose={() => onClose(p.id)}
            hint={showShortcuts && labels[i] != null ? `⌃${labels[i]}` : undefined}
          />
        ))}
      </div>
      <div className="sidebar-divider" />
    </>
  );
}
