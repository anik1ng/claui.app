import { useEffect, useState } from 'react';
import { listSessions, type SessionInfo } from '../ipc/commands';
import { relativeTime } from './relativeTime';
import './Sidebar.css';

interface Props {
  projectPath: string;
  activeSessionId: string | null;
  onPickSession: (id: string) => void;
  onNewSession: () => void;
}

/**
 * The right-hand sessions sidebar. Lists the current project's `claude`
 * sessions (newest first) and switches the terminal to one on click. Reloads
 * when the project or the active session changes, and on mount — so toggling
 * the sidebar back open refreshes the list.
 */
export function Sidebar({ projectPath, activeSessionId, onPickSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listSessions(projectPath).then((list) => {
      if (!cancelled) setSessions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath, activeSessionId]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>SESSIONS</span>
        <button type="button" className="sidebar-new" onClick={onNewSession}>
          + New
        </button>
      </div>
      <div className="sidebar-list">
        {sessions.map((s) => (
          <button
            type="button"
            key={s.id}
            className={s.id === activeSessionId ? 'session-row active' : 'session-row'}
            onClick={() => onPickSession(s.id)}
          >
            <span className="session-title">{s.title}</span>
            <span className="session-meta">
              <span
                className={s.id === activeSessionId ? 'session-dot active' : 'session-dot'}
              />
              {relativeTime(s.lastActivity)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
