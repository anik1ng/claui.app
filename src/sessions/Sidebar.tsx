// src/sessions/Sidebar.tsx
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import './Sidebar.css';

interface Props {
  children?: ReactNode;
  /** Current width in px (drag-resizable, persisted in localStorage). */
  width: number;
  /** Starts a resize drag from the left-edge handle. */
  onHandleMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

/**
 * The right-hand sidebar shell. The two sections inside —
 * `<ProjectsSection>` and `<SessionsSection>` — are composed by the App,
 * with the sessions section routed in via a portal from the active
 * `<ProjectArea>` (whose `useSessionsPolling` provides the data scoped to
 * that project). The visual language of both sections is shared through
 * `<ListRow>`.
 *
 * The left edge carries a drag handle (`useSidebarResize`) for resizing.
 */
export function Sidebar({ children, width, onHandleMouseDown }: Props) {
  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-resize-handle" onMouseDown={onHandleMouseDown} aria-hidden />
      {children}
    </div>
  );
}
