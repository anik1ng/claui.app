// src/tabs/types.ts

/** Kind of process hosted by a tab. */
export type TabKind = 'claude' | 'shell';

/**
 * One tab in the workspace tab bar.
 *
 * `uid` is a stable client-side id allocated by `useTabs` at creation time
 * (e.g. `"tab-1"`, `"tab-2"`). It is NOT the Rust PTY id — Rust's PTY id is
 * allocated by `state.alloc_id` *after* spawn completes, and `TerminalView`
 * owns it internally. `uid` is used as the React key and as the argument to
 * `setActive` / `closeTab`.
 */
export interface Tab {
  uid: string;
  kind: TabKind;
  /** True only for the first claude tab of the open project. Pinned, no close. */
  isPrimary: boolean;
  /** Session id passed as `--resume`, if any. null for fresh claudes. */
  resumeId: string | null;
  /**
   * Session id known to claui. Filled at create from `resumeId` for resumed
   * tabs; filled via `status:update` for the primary tab; null for fresh
   * non-primary tabs (a known 3a limitation — see spec §2).
   */
  sessionId: string | null;
}

export interface TabsState {
  tabs: Tab[];
  activeUid: string | null;
}
