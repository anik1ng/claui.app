import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ProjectPicker } from './project/ProjectPicker';
import { ProjectArea } from './layout/ProjectArea';
import { TitleBar } from './layout/TitleBar';
import { Sidebar } from './sessions/Sidebar';
import { useSidebar } from './sessions/useSidebar';
import { ProjectsSection } from './projects/ProjectsSection';
import { useProjects } from './projects/useProjects';
import { useProjectSwitchKeyboard } from './projects/useProjectSwitchKeyboard';
import { basename } from './projects/basename';
import { useHeldModifier } from './layout/useHeldModifier';
import { useChromeSlots } from './layout/useChromeSlots';
import { useStatusByProject } from './status/useStatusByProject';
import { useGlobalRateLimits } from './status/useGlobalRateLimits';
import { useNotifyByProject } from './notify/useNotifyByProject';
import { useActivityByProject } from './activity/useActivityByProject';
import { useWorkingProjects } from './activity/useWorkingProjects';
import { useWindowFocus } from './notify/useWindowFocus';
import { projectAggregate, type NotifyKind } from './notify/notifyStore';
import { useFileDrop } from './terminal/useFileDrop';
import { useUpdaterCheck } from './updater/useUpdaterCheck';
import { UpdateToast } from './updater/UpdateToast';
import { pickProjectFolder } from './project/pickProjectFolder';
import type { StatusPayload } from './ipc/commands';
import { defaultTheme, setTheme } from './theme/themeStore';
import './App.css';

const EMPTY_NOTIFY: ReadonlyMap<string, NotifyKind> = new Map();
const EMPTY_STATUS: ReadonlyMap<string, StatusPayload> = new Map();
const EMPTY_WORKING: ReadonlySet<string> = new Set();

export default function App() {
  const { projects, activeId, addProject, closeProject, setActive, reorderProject, isHydrating } = useProjects();
  const statuses = useStatusByProject();
  const { byProject: activityByProject, clear: clearActivity, clearProject: clearActivityProject } = useActivityByProject();
  const workingProjectsSet = useWorkingProjects(activityByProject);
  const globalRateLimits = useGlobalRateLimits();
  const getProjectName = useCallback(
    (id: string) => { const p = projects.find((x) => x.id === id); return p ? basename(p.path) : id; },
    [projects],
  );
  const { byProject: notifyByProject, markViewed, clear: clearNotify, onFocus, onBlur } = useNotifyByProject(getProjectName);
  const projectDots = useMemo(() => projectAggregate(notifyByProject), [notifyByProject]);
  const {
    toast: updateToast,
    checkForUpdates,
    install: installUpdate,
    dismiss: dismissUpdate,
  } = useUpdaterCheck();
  const [claudeMissing, setClaudeMissing] = useState(false);
  const { open: sidebarOpen, setOpen: setSidebarOpen, width: sidebarWidth, onHandleMouseDown: onSidebarResize } = useSidebar();
  const heldModifier = useHeldModifier();

  // Portal slots for the active project's chrome (see useChromeSlots).
  const chrome = useChromeSlots();

  useEffect(() => {
    setTheme(defaultTheme);
  }, []);

  useWindowFocus(onFocus, onBlur);

  // Dropping a file onto the window inserts its path into the focused
  // terminal's prompt (Tauri's drag-drop handler is enabled in lib.rs).
  useFileDrop();

  useEffect(() => {
    const unNotFound = listen('claude:not-found', () => setClaudeMissing(true));
    // When the user clicks an OS notification banner, Rust focuses the window
    // and emits `notify:activate`. Switch to the target project here; the
    // matching ProjectArea's own listener (not gated on isActive) selects the tab.
    const unActivate = listen<{ projectId: string; tabId: string }>('notify:activate', (e) => { setActive(e.payload.projectId); });
    return () => { void unNotFound.then((fn) => fn()); void unActivate.then((fn) => fn()); };
  }, [setActive]);

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
      // Also drop the project's activity entry — its tabs' PTYs die without a
      // Stop hook, so nothing else would ever clear it from the map.
      closeProject(id); clearActivityProject(id);
    },
    [closeProject, clearActivityProject],
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
        workspaceTabsRef={chrome.setWorkspaceTabs}
        showTabActions={projects.length > 0}
        onOpenClaude={() => void emit('menu:new-claude-tab')}
        onOpenShell={() => void emit('menu:new-shell-tab')}
        emptyTitle={projects.length === 0 ? 'claui' : undefined}
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
                statusByTab={statuses.get(p.id) ?? EMPTY_STATUS}
                globalRateLimits={globalRateLimits}
                notifyTabs={notifyByProject.get(p.id) ?? EMPTY_NOTIFY}
                workingTabs={activityByProject.get(p.id) ?? EMPTY_WORKING}
                onViewActiveTab={markViewed}
                onClearTabNotify={clearNotify}
                onClearTabActivity={clearActivity}
                setSidebarOpen={setSidebarOpen}
                showTabShortcuts={heldModifier === 'ctrl'}
                slots={chrome.slots}
              />
            ))}
          </div>
          {sidebarOpen && (
            <Sidebar width={sidebarWidth} onHandleMouseDown={onSidebarResize}>
              <ProjectsSection
                projects={projects}
                activeId={activeId}
                onPick={setActive}
                onClose={handleCloseProject}
                onAdd={requestAddProject}
                showShortcuts={heldModifier === 'meta'}
                indicators={projectDots}
                workingProjects={workingProjectsSet}
                onReorder={reorderProject}
              />
              {/* Portal targets — the active ProjectArea renders SessionsSection
                  and CapabilitiesSection into these slots via createPortal. */}
              <div ref={chrome.setSessions} className="sessions-slot" />
              <div ref={chrome.setCapabilities} className="capabilities-slot" />
            </Sidebar>
          )}
        </div>
      )}
      {/* StatusBar sits at the bottom of the window. The active ProjectArea
          portals its <StatusBar /> here. Empty when no projects yet. */}
      <div ref={chrome.setStatus} />
      <UpdateToast
        toast={updateToast}
        onInstall={() => void installUpdate()}
        onDismiss={dismissUpdate}
      />
    </>
  );
}
