import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { ProjectPicker } from './project/ProjectPicker';
import { Layout } from './layout/Layout';
import { getLastProject, getTheme } from './ipc/commands';
import { setTheme } from './theme/themeStore';
import type { Theme } from './theme/themeStore';
import './App.css';

export default function App() {
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [claudeMissing, setClaudeMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getTheme();
      setTheme(t);
      setThemeState(t);
      setProject(await getLastProject());
      setReady(true);
    })();
    const unlisten = listen('claude:not-found', () => setClaudeMissing(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  if (!ready || !theme) return null;

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
        <Layout theme={theme} projectPath={project} />
      ) : (
        <ProjectPicker onPick={setProject} />
      )}
    </>
  );
}
