// src/sessions/Sidebar.tsx
import { type SessionInfo } from '../ipc/commands';
import { relativeTime } from './relativeTime';
import './Sidebar.css';

interface Props {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  /** Set of sessionIds currently held by some workspace tab. */
  openSessionIds: Set<string>;
  onPickSession: (id: string) => void;
  onNewSession: () => void;
}

/**
 * The right-hand sessions sidebar. Lists the current project's `claude`
 * sessions (newest first). Polling lives in `useSessionsPolling`, hoisted
 * to `Layout`; both this sidebar and `WorkspaceTabBar` derive from the
 * same `sessions` array.
 *
 * Click semantics (see spec §6.4): the caller (`Layout`) routes the click
 * — if the sessionId is already open in some tab, focus that tab; else
 * open a new tab with `--resume <id>`. From the sidebar's side, every
 * click is just `onPickSession(id)`; rows whose session is currently in
 * a tab get a secondary indicator glyph (the "open elsewhere" dot).
 */
export function Sidebar({
  sessions,
  activeSessionId,
  openSessionIds,
  onPickSession,
  onNewSession,
}: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>SESSIONS</span>
        <button type="button" className="sidebar-new" onClick={onNewSession}>
          + New
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          const isOpen = openSessionIds.has(s.id);
          return (
            <button
              type="button"
              key={s.id}
              className={isActive ? 'session-row active' : 'session-row'}
              onClick={() => onPickSession(s.id)}
            >
              <span className="session-title">{s.title}</span>
              <span className="session-meta">
                <span className={isActive ? 'session-dot active' : 'session-dot'} />
                {relativeTime(s.lastActivity)}
                {isOpen && !isActive && (
                  <span className="session-row-open" title="Open in a tab" aria-hidden>
                    ↗
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
