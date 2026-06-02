import { invoke, Channel } from '@tauri-apps/api/core';
import type { NotifyKind } from '../notify/notifyStore';

// Re-export the Channel type so terminal components can annotate their
// output callbacks without importing @tauri-apps/api/core directly —
// eslint.config.js restricts that import to this file, the single IPC funnel.
export type { Channel } from '@tauri-apps/api/core';
export type { NotifyKind } from '../notify/notifyStore';

export interface ProjectEntry {
  id: string;
  path: string;
}

export interface WindowState {
  version: number;
  projects: ProjectEntry[];
  activeId: string | null;
}

export const getWindowState = () => invoke<WindowState | null>('get_window_state');

export const saveWindowState = (state: WindowState) =>
  invoke<void>('save_window_state', { state });

export const cleanupProjectStatus = (projectId: string) =>
  invoke<void>('cleanup_project_status', { projectId });

/** Shape of `notify:update` events — routes a kind to its project + tab. */
export interface NotifyUpdate {
  projectId: string;
  tabId: string;
  kind: NotifyKind;
}

export const cleanupTabNotify = (tabId: string) =>
  invoke<void>('cleanup_tab_notify', { tabId });

/** Stash the project/tab the user should land on when they click an OS
 *  notification. Registered in Task 5; safe to call before then — the
 *  Rust side will reject it and the caller swallows the error. */
export const stashPendingActivation = (projectId: string, tabId: string) =>
  invoke<void>('stash_pending_activation', { projectId, tabId });

/** Bring the main window to front and emit `notify:activate` with the
 *  stashed project/tab so the webview can deep-link to it. */
export function activatePending(): Promise<void> {
  return invoke('activate_pending');
}

export const openProject = (
  path: string,
  onOutput: Channel<ArrayBuffer>,
  cols: number,
  rows: number,
  resumeSessionId: string | undefined,
  isPrimary: boolean,
  projectId: string,
  tabUid: string,
) =>
  invoke<number>('open_project', {
    path,
    onOutput,
    cols,
    rows,
    resumeSessionId,
    isPrimary,
    projectId,
    tabId: tabUid,
  });

export const openCommandTerminal = (
  path: string,
  onOutput: Channel<ArrayBuffer>,
  cols: number,
  rows: number,
) => invoke<number>('open_command_terminal', { path, onOutput, cols, rows });

export const ptyInput = (id: number, data: string) =>
  invoke('pty_input', { id, data });

export const ptyResize = (id: number, cols: number, rows: number) =>
  invoke('pty_resize', { id, cols, rows });

export const ptyClose = (id: number) => invoke('pty_close', { id });

/**
 * Live Claude Code state, captured from `claude`'s statusline JSON. Every
 * field is null when absent — the status bar degrades field by field.
 */
export interface StatusPayload {
  sessionId: string | null;
  model: string | null;
  contextPct: number | null;
  costUsd: number | null;
  fiveHourPct: number | null;
  fiveHourResetsAt: number | null;
  sevenDayPct: number | null;
  sevenDayResetsAt: number | null;
}

/**
 * The shape of `status:update` events. Wraps the per-project payload with
 * its `projectId` so the webview can route updates to the matching
 * ProjectArea.
 */
export interface StatusUpdate {
  projectId: string;
  status: StatusPayload;
}

/** One `claude` session of a project, for the sessions sidebar. */
export interface SessionInfo {
  id: string;
  title: string;
  /** Last-activity time — the session file's mtime, in Unix milliseconds. */
  lastActivity: number;
}

export const listSessions = (path: string) =>
  invoke<SessionInfo[]>('list_sessions', { path });

/**
 * Create a Channel that normalizes the backend's binary payload to a
 * Uint8Array and forwards it. Tauri may deliver `Vec<u8>` as an ArrayBuffer,
 * a Uint8Array, or a plain number array — all are handled.
 */
export function makeOutputChannel(
  onBytes: (data: Uint8Array) => void,
): Channel<ArrayBuffer> {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = (payload) => {
    const raw = payload as unknown;
    if (raw instanceof ArrayBuffer) {
      onBytes(new Uint8Array(raw));
    } else if (raw instanceof Uint8Array) {
      onBytes(raw);
    } else {
      onBytes(new Uint8Array(raw as number[]));
    }
  };
  return channel;
}
