import type { ProjectEntry } from '../ipc/commands';
import { ListRow } from '../sessions/ListRow';

interface Props {
  projects: ProjectEntry[];
  activeId: string | null;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

/** Last segment of an absolute path; falls back to the full string. */
function basename(p: string): string {
  if (!p) return p;
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf('/');
  return idx < 0 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * Top half of the right sidebar — the list of open projects. Renders nothing
 * when there's only one project (no choice to surface). Uses the same
 * `<ListRow>` as the sessions section below so the two read as one unified
 * navigation panel.
 */
export function ProjectsSection({ projects, activeId, onPick, onClose, onAdd }: Props) {
  if (projects.length < 2) return null;
  return (
    <>
      <div className="sidebar-header">
        <span>PROJECTS</span>
        <button type="button" className="sidebar-new" onClick={onAdd}>
          + Add
        </button>
      </div>
      <div className="sidebar-list">
        {projects.map((p) => (
          <ListRow
            key={p.id}
            label={basename(p.path)}
            isActive={p.id === activeId}
            title={p.path}
            onClick={() => onPick(p.id)}
            onClose={() => onClose(p.id)}
          />
        ))}
      </div>
      <div className="sidebar-divider" />
    </>
  );
}
