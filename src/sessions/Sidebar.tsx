// src/sessions/Sidebar.tsx
import type { ReactNode } from 'react';
import './Sidebar.css';

interface Props {
  children?: ReactNode;
}

/**
 * The right-hand sidebar shell. The two sections inside —
 * `<ProjectsSection>` and `<SessionsSection>` — are composed by the App,
 * with the sessions section routed in via a portal from the active
 * `<ProjectArea>` (whose `useSessionsPolling` provides the data scoped to
 * that project). The visual language of both sections is shared through
 * `<ListRow>`.
 */
export function Sidebar({ children }: Props) {
  return <div className="sidebar">{children}</div>;
}
