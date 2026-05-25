import { useCallback } from 'react';
import { TerminalView } from '../terminal/TerminalView';
import { type Channel, openCommandTerminal, openProject } from '../ipc/commands';
import type { Tab } from '../tabs/types';
import type { Theme } from '../theme/themeStore';

interface Props {
  tab: Tab;
  projectPath: string;
  theme: Theme;
  isActive: boolean;
}

/**
 * One workspace tab's rendered pane. Owns a stable `open` callback for its
 * `<TerminalView>` so the underlying PTY is spawned once per tab and not
 * re-spawned when unrelated Layout state (e.g. `status:update` ticks,
 * drawer height drag) changes.
 *
 * Why this is a separate component: `useCallback` cannot be called inside
 * `Layout`'s `tabs.map(...)` loop (hooks must be at the top level of a
 * component). Hoisting each tab into its own component scope gives each
 * tab its own stable callback whose identity tracks only the props that
 * actually matter for the spawn — `projectPath`, `tab.kind`, `tab.resumeId`,
 * `tab.isPrimary`.
 */
export function TabPane({ tab, projectPath, theme, isActive }: Props) {
  const open = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) => {
      if (tab.kind === 'claude') {
        return openProject(
          projectPath,
          ch,
          cols,
          rows,
          tab.resumeId ?? undefined,
          tab.isPrimary,
        );
      }
      return openCommandTerminal(projectPath, ch, cols, rows);
    },
    [projectPath, tab.kind, tab.resumeId, tab.isPrimary],
  );

  return (
    <div className={isActive ? 'layout-tab-pane active' : 'layout-tab-pane'}>
      <TerminalView theme={theme} open={open} autoFocus={isActive} />
    </div>
  );
}
