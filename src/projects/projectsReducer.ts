import type { ProjectEntry, ProjectsState } from './types';

export type ProjectsAction =
  | { type: 'add'; project: ProjectEntry }
  | { type: 'setActive'; id: string }
  | { type: 'closeProject'; id: string }
  | { type: 'reorder'; id: string; toIndex: number }
  | { type: 'restore'; state: ProjectsState };

export const initialState: ProjectsState = { projects: [], activeId: null };

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case 'add':
      // INVARIANT: caller must ensure `action.project.id` is unique. The guard
      // lives in `useProjects.addProject` (which has access to current state
      // to look up duplicates by path or id); the reducer accepts what it's told.
      return {
        projects: [...state.projects, action.project],
        activeId: action.project.id,
      };

    case 'setActive': {
      const exists = state.projects.some((p) => p.id === action.id);
      return exists ? { ...state, activeId: action.id } : state;
    }

    case 'closeProject': {
      const idx = state.projects.findIndex((p) => p.id === action.id);
      if (idx < 0) return state;
      const projects = state.projects.filter((_, i) => i !== idx);
      let activeId = state.activeId;
      if (state.activeId === action.id) {
        if (projects.length === 0) {
          activeId = null;
        } else {
          // Left neighbour, or new first if we removed the head.
          activeId = projects[Math.max(0, idx - 1)].id;
        }
      }
      return { projects, activeId };
    }

    case 'reorder': {
      const from = state.projects.findIndex((p) => p.id === action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(action.toIndex, state.projects.length - 1));
      if (from === to) return state;
      const projects = [...state.projects];
      const [moved] = projects.splice(from, 1);
      projects.splice(to, 0, moved);
      return { ...state, projects };
    }

    case 'restore':
      return action.state;
  }
}
