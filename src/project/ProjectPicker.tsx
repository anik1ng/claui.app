import { open } from '@tauri-apps/plugin-dialog';
import './ProjectPicker.css';

interface Props {
  onPick: (path: string) => void;
}

export function ProjectPicker({ onPick }: Props) {
  const pick = async () => {
    const folder = await open({
      directory: true,
      multiple: false,
      title: 'Select a project folder',
    });
    if (typeof folder === 'string') onPick(folder);
  };
  return (
    <div className="project-picker">
      <h1>claui</h1>
      <p>Choose a project folder to start Claude Code in.</p>
      <button onClick={() => void pick()}>Open folder…</button>
    </div>
  );
}
