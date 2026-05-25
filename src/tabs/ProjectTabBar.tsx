// src/tabs/ProjectTabBar.tsx
import { basename } from './basename';
import './ProjectTabBar.css';

interface Props {
  projectPath: string;
  onRequestProjectSwitch: () => void;
}

/**
 * 38px-tall project tab strip at the top of the window.
 *
 * In 3a the bar renders exactly one tab (the current project) and a `＋`
 * button. The `＋` triggers `onRequestProjectSwitch`, which is the same
 * callback wired to the File → Open Project menu — both paths converge
 * in App.tsx and end up calling `pickProjectFolder + setProject`.
 *
 * The active tab gets a 2px `--claui-accent` strip along the TOP edge,
 * mirroring the sessions sidebar's accent-strip language rotated 90°.
 */
export function ProjectTabBar({ projectPath, onRequestProjectSwitch }: Props) {
  return (
    <div className="proj-tab-bar">
      <div className="proj-tab active">
        <span className="proj-tab-dot" aria-hidden />
        <span className="proj-tab-name">{basename(projectPath)}</span>
      </div>
      <button
        type="button"
        className="proj-tab-add"
        title="Open another project (replaces current in 3a)"
        onClick={onRequestProjectSwitch}
      >
        ＋
      </button>
    </div>
  );
}
