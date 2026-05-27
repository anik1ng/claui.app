import { useCallback } from 'react';
import { TerminalView } from '../terminal/TerminalView';
import { type Channel, openCommandTerminal, openProject } from '../ipc/commands';
import type { Tab } from '../tabs/types';
import type { Theme } from '../theme/themeStore';

interface Props {
  tab: Tab;
  projectId: string;
  projectPath: string;
  theme: Theme;
  isActive: boolean;
  /**
   * Called when the tab's PTY spawn fails — host should remove the tab so a
   * never-running tab doesn't keep its `sessionId` reserved in the sidebar's
   * "open in tab" set.
   */
  onSpawnFailed?: () => void;
}

/**
 * One workspace tab's rendered pane. Owns a stable `open` callback for its
 * `<TerminalView>` so the PTY is spawned once per tab and not re-spawned
 * when unrelated ProjectArea state (e.g. `status:update` ticks, drawer drag)
 * changes. The dependency set on the callback is the minimum that affects
 * the spawn: projectId, projectPath, tab.kind, tab.resumeId, tab.isPrimary.
 *
 * Why this is a separate component: `useCallback` cannot be called inside
 * `ProjectArea`'s `tabs.map(...)` loop (hooks must be at the top level of a
 * component). Hoisting each tab into its own component scope gives each tab
 * its own stable callback whose identity tracks only the spawn-relevant props.
 */
export function TabPane({ tab, projectId, projectPath, theme, isActive, onSpawnFailed }: Props) {
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
          projectId,
        );
      }
      return openCommandTerminal(projectPath, ch, cols, rows);
    },
    [projectId, projectPath, tab.kind, tab.resumeId, tab.isPrimary],
  );

  return (
    <div className={isActive ? 'layout-tab-pane active' : 'layout-tab-pane'}>
      <TerminalView
        theme={theme}
        open={open}
        autoFocus={isActive}
        onSpawnFailed={onSpawnFailed}
      />
    </div>
  );
}
