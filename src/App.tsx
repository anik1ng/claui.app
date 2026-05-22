import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ProjectPicker } from './project/ProjectPicker';
import { Layout } from './layout/Layout';
import { getLastProject } from './ipc/commands';
import { defaultTheme, setTheme } from './theme/themeStore';
import './App.css';

export default function App() {
  const [project, setProject] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [claudeMissing, setClaudeMissing] = useState(false);

  useEffect(() => {
    setTheme(defaultTheme);
    (async () => {
      setProject(await getLastProject());
      setReady(true);
    })();
    const unlisten = listen('claude:not-found', () => setClaudeMissing(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  if (!ready) return null;

  return (
    <>
      {claudeMissing && (
        <div className="claui-banner">
          <code>claude</code> not found. Install Claude Code:{' '}
          <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
            claude.com/claude-code
          </a>
        </div>
      )}
      {project ? (
        <Layout theme={defaultTheme} projectPath={project} />
      ) : (
        <ProjectPicker onPick={setProject} />
      )}
    </>
  );
}
