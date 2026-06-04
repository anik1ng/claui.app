import type { ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { StatusBar } from '../status/StatusBar';
import { SessionsSection } from '../sessions/SessionsSection';
import { CapabilitiesSection } from '../capabilities/CapabilitiesSection';
import { WorkspaceTabBar } from '../tabs/WorkspaceTabBar';
import type { StatusPayload } from '../ipc/commands';
import type { ProjectChromeSlots } from './ProjectArea';

interface Props {
  isActive: boolean;
  slots: ProjectChromeSlots;
  projectPath: string;
  status: StatusPayload | null;
  /** Exact WorkspaceTabBar props, threaded straight through. */
  tabBar: ComponentProps<typeof WorkspaceTabBar>;
  /** Exact SessionsSection props, threaded straight through. */
  sessionsList: ComponentProps<typeof SessionsSection>;
}

/**
 * The active project's chrome, portaled into the App-level slots
 * (`#workspace-tabs-slot`, `#status-slot`, `#sessions-slot`,
 * `#capabilities-slot`). Extracted from `ProjectArea` so that file's main
 * component stays focused (and under the function-length limit) as the sidebar
 * gains more sections. Renders nothing unless this project is active.
 */
export function ProjectChrome({ isActive, slots, projectPath, status, tabBar, sessionsList }: Props) {
  if (!isActive) return null;
  return (
    <>
      {slots.workspaceTabs && createPortal(<WorkspaceTabBar {...tabBar} />, slots.workspaceTabs)}
      {slots.status && createPortal(<StatusBar status={status} />, slots.status)}
      {slots.sessions && createPortal(<SessionsSection {...sessionsList} />, slots.sessions)}
      {slots.capabilities &&
        createPortal(<CapabilitiesSection projectPath={projectPath} isActive={isActive} />, slots.capabilities)}
    </>
  );
}
