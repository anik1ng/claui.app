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
 * sessions (newest first) and switches the terminal to one on click.
 *
 * Refresh strategy: refetch immediately when the project or active session
 * changes, then poll every 2 seconds. Polling is the simplest robust way to
 * catch a new session's JSONL appearing on disk — `+ New` triggers an
 * `activeSessionId` change, but `claude` writes its session file only after
 * the first turn, so a single trigger-driven refetch can race the disk write.
 */
export function Sidebar({ projectPath, activeSessionId, onPickSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      void listSessions(projectPath).then((list) => {
        if (!cancelled) setSessions(list);
      });
    };
    refetch();
    const interval = window.setInterval(refetch, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
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
