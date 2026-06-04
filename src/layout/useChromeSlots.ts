import { useState } from 'react';
import type { ProjectChromeSlots } from './ProjectArea';

export interface ChromeSlots {
  /** The slot DOM nodes, passed to the active ProjectArea's portals. */
  slots: ProjectChromeSlots;
  setWorkspaceTabs: (el: HTMLElement | null) => void;
  setStatus: (el: HTMLElement | null) => void;
  setSessions: (el: HTMLElement | null) => void;
  setCapabilities: (el: HTMLElement | null) => void;
}

/**
 * App-level chrome portal slots. Each is tracked via a callback ref (returned as
 * a `set*` function) so when a slot's parent unmounts/remounts (e.g. the Sidebar
 * toggled by Ctrl+B) the new DOM node propagates and the active ProjectArea
 * re-portals into it. Extracted so App's body stays under the length limit as
 * the number of sidebar/title-bar slots grows.
 */
export function useChromeSlots(): ChromeSlots {
  const [workspaceTabs, setWorkspaceTabs] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<HTMLElement | null>(null);
  const [sessions, setSessions] = useState<HTMLElement | null>(null);
  const [capabilities, setCapabilities] = useState<HTMLElement | null>(null);
  return {
    slots: { workspaceTabs, status, sessions, capabilities },
    setWorkspaceTabs,
    setStatus,
    setSessions,
    setCapabilities,
  };
}
