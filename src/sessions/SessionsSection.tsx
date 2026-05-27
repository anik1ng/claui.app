import type { SessionInfo } from '../ipc/commands';
import { ListRow } from './ListRow';
import { relativeTime } from './relativeTime';

interface Props {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  /** Set of sessionIds currently held by some workspace tab. */
  openSessionIds: Set<string>;
  onPick: (id: string) => void;
  onNew: () => void;
}

/**
 * Bottom half of the right sidebar — the active project's sessions list.
 * Shares `<ListRow>` with the projects section so both render with one
 * visual language: active accent strip on the left, label, optional meta,
 * hover-revealed × for closeable rows (sessions are not closeable so no ×).
 */
export function SessionsSection({
  sessions,
  activeSessionId,
  openSessionIds,
  onPick,
  onNew,
}: Props) {
  return (
    <>
      <div className="sidebar-header">
        <span>SESSIONS</span>
        <button type="button" className="sidebar-new" onClick={onNew}>
          + New
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          const isOpen = openSessionIds.has(s.id);
          return (
            <ListRow
              key={s.id}
              label={s.title}
              meta={relativeTime(s.lastActivity)}
              badge={isOpen && !isActive ? 'open' : undefined}
              isActive={isActive}
              onClick={() => onPick(s.id)}
            />
          );
        })}
      </div>
    </>
  );
}
