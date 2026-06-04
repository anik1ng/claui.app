/** Payload of the `get_capabilities` command — mirrors the Rust serde struct
 *  in `src-tauri/src/capabilities.rs` (camelCase). Read-only snapshot of what
 *  the active project's Claude Code has available. */

export interface NamedItem {
  name: string;
  /** A plugin name, or `project` / `personal`. */
  source: string;
}

export interface PluginItem {
  name: string;
  version: string;
  skillCount: number;
  hasMcp: boolean;
}

export interface HookItem {
  event: string;
  label: string;
}

export interface PermissionItem {
  pattern: string;
  decision: 'allow' | 'ask' | 'deny';
}

export interface Capabilities {
  skills: NamedItem[];
  plugins: PluginItem[];
  agents: NamedItem[];
  hooks: HookItem[];
  permissions: PermissionItem[];
}

export const EMPTY_CAPABILITIES: Capabilities = {
  skills: [],
  plugins: [],
  agents: [],
  hooks: [],
  permissions: [],
};
