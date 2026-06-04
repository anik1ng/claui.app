import { useCallback, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useCapabilities } from './useCapabilities';
import type { NamedItem } from './types';
import './capabilities.css';

/** Per-group collapse state for the whole panel, persisted to localStorage as
 *  one object. Lifted to the section (rather than per-Group) so a toggle is a
 *  single state change the overlay scrollbar can react to (re-measure). All
 *  groups start collapsed — the panel is a compact set of headers until the
 *  user opens what they care about. */
function useOpenGroups() {
  const key = 'claui.caps.open';
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const toggle = useCallback((id: string, next: boolean) => {
    setOpen((prev) => {
      const updated = { ...prev, [id]: next };
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  }, []);
  return { open, toggle };
}

function Group({ id, label, count, open, onToggle, children }: {
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: (id: string, next: boolean) => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details
      className="caps-grp"
      open={open}
      onToggle={(e: SyntheticEvent<HTMLDetailsElement>) => onToggle(id, e.currentTarget.open)}
    >
      <summary className="caps-head">
        <span className="caps-chev">▸</span>
        <span className="caps-label">{label}</span>
        <span className="caps-count">{count}</span>
      </summary>
      <div className="caps-body">{children}</div>
    </details>
  );
}

function NameRow({ item }: { item: NamedItem }) {
  return (
    <div className="caps-row" title={item.source}>
      <span className="caps-lead">{item.name}</span>
    </div>
  );
}

/**
 * Read-only capabilities panel for the active project — collapsible Skills /
 * Plugins / Agents / Hooks / Permissions groups in the sidebar's secondary
 * region. Info-only. Shares the app's overlay scrollbar (no native bar) and is
 * content-sized so it never dominates the sidebar. Portaled into
 * `#capabilities-slot` by the active ProjectArea.
 */
export function CapabilitiesSection({ projectPath, isActive }: { projectPath: string; isActive: boolean }) {
  const caps = useCapabilities(projectPath, isActive);
  const { open, toggle } = useOpenGroups();
  const { skills, plugins, agents, hooks, permissions } = caps;
  return (
    <div className="caps">
      <Group id="skills" label="Skills" count={skills.length} open={open.skills ?? false} onToggle={toggle}>
        {skills.map((s) => <NameRow key={`${s.source}/${s.name}`} item={s} />)}
      </Group>
      <Group id="plugins" label="Plugins" count={plugins.length} open={open.plugins ?? false} onToggle={toggle}>
        {plugins.map((p) => (
          <div className="caps-row" key={p.name}>
            <span className="caps-lead">{p.name}</span>
            <span className="caps-meta">{p.skillCount} skills{p.hasMcp ? ' · MCP' : ''}</span>
          </div>
        ))}
      </Group>
      <Group id="agents" label="Agents" count={agents.length} open={open.agents ?? false} onToggle={toggle}>
        {agents.map((a) => <NameRow key={`${a.source}/${a.name}`} item={a} />)}
      </Group>
      <Group id="hooks" label="Hooks" count={hooks.length} open={open.hooks ?? false} onToggle={toggle}>
        {hooks.map((h, i) => (
          <div className="caps-row" key={`${h.event}-${h.label}-${i}`}>
            <span className="caps-lead">{h.event}</span>
            <span className="caps-meta">{h.label}</span>
          </div>
        ))}
      </Group>
      <Group id="permissions" label="Permissions" count={permissions.length} open={open.permissions ?? false} onToggle={toggle}>
        {permissions.map((p, i) => (
          <div className="caps-row" key={`${p.pattern}-${p.decision}-${i}`}>
            <span className="caps-lead">{p.pattern}</span>
            <span className={`caps-tag ${p.decision}`}>{p.decision}</span>
          </div>
        ))}
      </Group>
    </div>
  );
}
