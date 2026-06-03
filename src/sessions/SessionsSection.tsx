import type { SessionInfo } from '../ipc/commands';
import { ListRow } from './ListRow';
import { useOverlayScrollbar } from '../scroll/useOverlayScrollbar';
import { relativeTime } from './relativeTime';

/**
 * What the user expressed by clicking on a session row.
 *
 *  - `default`: macOS-classic — reuse the active claude tab if it's claude,
 *    otherwise open a new tab.
 *  - `newTab`: explicit "open in new tab" (Cmd+click, middle-click later).
 *
 * Abstracting the intent here decouples callers from how it was expressed.
 * If we add keyboard shortcuts or right-click later, only this enum grows.
 */
export type SessionPickIntent = 'default' | 'newTab';

interface Props {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  /** Set of sessionIds currently held by some workspace tab. */
  openSessionIds: Set<string>;
  onPick: (id: string, intent: SessionPickIntent) => void;
  /** Start a fresh session. `newTab` (Cmd-click) opens it in a new tab;
   *  otherwise it reuses the active claude tab — mirroring `onPick`'s intent. */
  onNew: (newTab: boolean) => void;
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
  const listRef = useOverlayScrollbar(sessions.length);
  return (
    <>
      <div className="sidebar-header">
        <span>SESSIONS</span>
        <button
          type="button"
          className="sidebar-new"
          onClick={(e) => onNew(e.metaKey)}
        >
          + New
        </button>
      </div>
      <div className="sidebar-list" ref={listRef}>
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
              onClick={(e) => onPick(s.id, e.metaKey ? 'newTab' : 'default')}
            />
          );
        })}
      </div>
    </>
  );
}
