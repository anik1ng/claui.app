// src/tabs/basename.ts

/** Last path segment of an absolute path; falls back to the full string. */
export function basename(p: string): string {
  if (!p) return p;
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
  const idx = trimmed.lastIndexOf('/');
  return idx < 0 ? trimmed : trimmed.slice(idx + 1);
}
