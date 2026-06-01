import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ProjectPicker } from './project/ProjectPicker';
import { ProjectArea } from './layout/ProjectArea';
import { TitleBar } from './layout/TitleBar';
import { Sidebar } from './sessions/Sidebar';
import { ProjectsSection } from './projects/ProjectsSection';
import { useProjects } from './projects/useProjects';
import { useProjectSwitchKeyboard } from './projects/useProjectSwitchKeyboard';
import { useHeldModifier } from './layout/useHeldModifier';
import { useStatusByProject } from './status/useStatusByProject';
import { useUpdaterCheck } from './updater/useUpdaterCheck';
import { UpdateToast } from './updater/UpdateToast';
import { pickProjectFolder } from './project/pickProjectFolder';
import { cleanupProjectStatus } from './ipc/commands';
import { defaultTheme, setTheme } from './theme/themeStore';
import './App.css';

export default function App() {
  const { projects, activeId, addProject, closeProject, setActive, isHydrating } = useProjects();
  const statuses = useStatusByProject();
  const {
    toast: updateToast,
    checkForUpdates,
    install: installUpdate,
    dismiss: dismissUpdate,
  } = useUpdaterCheck();
  const [claudeMissing, setClaudeMissing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const heldModifier = useHeldModifier();

  // Portal slots — tracked via callback refs so when a slot's parent unmounts
  // (e.g. Sidebar toggled by Ctrl+B) and remounts, the new DOM node propagates
  // here, ProjectArea re-renders, and createPortal targets the fresh element.
  const [workspaceTabsSlot, setWorkspaceTabsSlot] = useState<HTMLElement | null>(null);
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const [sessionsSlot, setSessionsSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTheme(defaultTheme);
  }, []);

  useEffect(() => {
    const unlisten = listen('claude:not-found', () => setClaudeMissing(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // The "Check for Updates…" menu item (src-tauri/src/menu.rs) emits this.
  // `checkForUpdates` is a stable callback, so this listener attaches once.
  useEffect(() => {
    const unlisten = listen('menu:check-updates', () => checkForUpdates());
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [checkForUpdates]);

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

  // Menu listeners are installed ONCE for App's lifetime. Live values are
  // read through `menuRef` so a re-register cycle on every projects/activeId
  // change can't open a race window where unlisten is in flight while the
  // next listen hasn't yet attached.
  const menuRef = useRef({ requestAddProject, handleCloseProject, activeId });
  menuRef.current = { requestAddProject, handleCloseProject, activeId };
  useEffect(() => {
    const unlistenAdd = listen('menu:add-project', () => menuRef.current.requestAddProject());
    const unlistenClose = listen('menu:close-project', () => {
      const { handleCloseProject: closeNow, activeId: id } = menuRef.current;
      if (id) closeNow(id);
    });
    return () => {
      void unlistenAdd.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
    };
  }, []);

  // Window title follows the active project. Resets to plain `claui` when
  // the project list is empty (otherwise the OS title bar would keep the
  // last-active project's name even after the ProjectPicker is showing).
  useEffect(() => {
    const active = projects.find((p) => p.id === activeId);
    const title = active
      ? `claui — ${active.path.split('/').filter(Boolean).pop() ?? active.path}`
      : 'claui';
    getCurrentWindow()
      .setTitle(title)
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
        workspaceTabsRef={setWorkspaceTabsSlot}
        showTabActions={projects.length > 0}
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
                showTabShortcuts={heldModifier === 'ctrl'}
                slots={{
                  workspaceTabs: workspaceTabsSlot,
                  status: statusSlot,
                  sessions: sessionsSlot,
                }}
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
                showShortcuts={heldModifier === 'meta'}
              />
              {/* Portal target — the active ProjectArea renders SessionsSection
                  into this slot via createPortal. */}
              <div ref={setSessionsSlot} className="sessions-slot" />
            </Sidebar>
          )}
        </div>
      )}
      {/* StatusBar sits at the bottom of the window. The active ProjectArea
          portals its <StatusBar /> here. Empty when no projects yet. */}
      <div ref={setStatusSlot} />
      <UpdateToast
        toast={updateToast}
        onInstall={() => void installUpdate()}
        onDismiss={dismissUpdate}
      />
    </>
  );
}
