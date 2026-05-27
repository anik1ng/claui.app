import { useCallback, useEffect, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ProjectPicker } from './project/ProjectPicker';
import { ProjectArea } from './layout/ProjectArea';
import { TitleBar } from './layout/TitleBar';
import { Sidebar } from './sessions/Sidebar';
import { ProjectsSection } from './projects/ProjectsSection';
import { useProjects } from './projects/useProjects';
import { useProjectSwitchKeyboard } from './projects/useProjectSwitchKeyboard';
import { useStatusByProject } from './status/useStatusByProject';
import { pickProjectFolder } from './project/pickProjectFolder';
import { cleanupProjectStatus } from './ipc/commands';
import { defaultTheme, setTheme } from './theme/themeStore';
import './App.css';

export default function App() {
  const { projects, activeId, addProject, closeProject, setActive, isHydrating } = useProjects();
  const statuses = useStatusByProject();
  const [claudeMissing, setClaudeMissing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setTheme(defaultTheme);
  }, []);

  useEffect(() => {
    const unlisten = listen('claude:not-found', () => setClaudeMissing(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const requestAddProject = useCallback(() => {
    void (async () => {
      const folder = await pickProjectFolder();
      if (folder) addProject(folder);
    })();
  }, [addProject]);

  const handleCloseProject = useCallback(
    (id: string) => {
      closeProject(id);
      void cleanupProjectStatus(id);
    },
    [closeProject],
  );

  useEffect(() => {
    const unlistenAdd = listen('menu:add-project', () => requestAddProject());
    const unlistenClose = listen('menu:close-project', () => {
      if (activeId) handleCloseProject(activeId);
    });
    return () => {
      void unlistenAdd.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
    };
  }, [requestAddProject, handleCloseProject, activeId]);

  // Window title follows the active project.
  useEffect(() => {
    const active = projects.find((p) => p.id === activeId);
    if (!active) return;
    const name = active.path.split('/').filter(Boolean).pop() ?? active.path;
    getCurrentWindow()
      .setTitle(`claui — ${name}`)
      .catch((err: unknown) => {
        console.warn('setTitle failed:', err);
      });
  }, [projects, activeId]);

  useProjectSwitchKeyboard({ projects, setActive });

  if (isHydrating) return null;

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
      <TitleBar
        onOpenClaude={() => void emit('menu:new-claude-tab')}
        onOpenShell={() => void emit('menu:new-shell-tab')}
      />
      {projects.length === 0 ? (
        <ProjectPicker onPick={(folder) => { addProject(folder); }} />
      ) : (
        <div className="app-body">
          <div className="app-projects">
            {projects.map((p) => (
              <ProjectArea
                key={p.id}
                theme={defaultTheme}
                projectId={p.id}
                projectPath={p.path}
                isActive={p.id === activeId}
                status={statuses.get(p.id) ?? null}
                setSidebarOpen={setSidebarOpen}
              />
            ))}
          </div>
          {sidebarOpen && (
            <Sidebar>
              <ProjectsSection
                projects={projects}
                activeId={activeId}
                onPick={setActive}
                onClose={handleCloseProject}
                onAdd={requestAddProject}
              />
              {/* Portal target — the active ProjectArea renders SessionsSection
                  into this slot via createPortal. */}
              <div id="sessions-slot" className="sessions-slot" />
            </Sidebar>
          )}
        </div>
      )}
      {/* StatusBar sits at the bottom of the window. The active ProjectArea
          portals its <StatusBar /> here. Empty when no projects yet. */}
      <div id="status-slot" />
    </>
  );
}
