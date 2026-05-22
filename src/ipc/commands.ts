import { invoke, Channel } from '@tauri-apps/api/core';

// Re-export the Channel type so terminal components can annotate their
// output callbacks without importing @tauri-apps/api/core directly —
// eslint.config.js restricts that import to this file, the single IPC funnel.
export type { Channel } from '@tauri-apps/api/core';

export const getLastProject = () => invoke<string | null>('get_last_project');

export const openProject = (
  path: string,
  onOutput: Channel<ArrayBuffer>,
  cols: number,
  rows: number,
) => invoke<number>('open_project', { path, onOutput, cols, rows });

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
