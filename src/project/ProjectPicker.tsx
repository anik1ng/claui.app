import { pickProjectFolder } from './pickProjectFolder';
import './ProjectPicker.css';

interface Props {
  onPick: (path: string) => void;
}

export function ProjectPicker({ onPick }: Props) {
  const pick = async () => {
    const folder = await pickProjectFolder();
    if (folder) onPick(folder);
  };
  return (
    <div className="project-picker">
      <h1>claui</h1>
      <p>Choose a project folder to start Claude Code in.</p>
      <button onClick={() => void pick()}>Open folder…</button>
    </div>
  );
}
