export interface ProjectEntry {
  /** Stable client-side uid (`crypto.randomUUID`). */
  id: string;
  /** Absolute path of the opened folder. */
  path: string;
}

export interface ProjectsState {
  projects: ProjectEntry[];
  /** id of the currently visible project; null when projects is empty. */
  activeId: string | null;
}
