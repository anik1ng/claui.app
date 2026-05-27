import type { ReactNode, SVGProps } from 'react';

interface IconShellProps extends SVGProps<SVGSVGElement> {
  children: ReactNode;
}

/**
 * Small inline SVG icons in Lucide's visual style: thin line strokes on
 * a 24x24 viewBox, rendered at 14x14 with `currentColor`. No dependency
 * — each path is hand-pasted from Lucide's MIT-licensed catalogue.
 */
function IconShell({ children, ...props }: IconShellProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/**
 * The Claude Code pixel-art mascot — the same wide-bodied creature with
 * two eyes and four feet that the `claude` CLI prints in its splash.
 * Drawn from `<rect>`s on a 24×24 viewBox so the chunky pixel feel
 * survives at any size. Filled with `currentColor` so it tracks the
 * icon-row colour (dim baseline → bright on hover), matching the other
 * stroke-based icons rather than carrying a fixed brand colour.
 */
export function IconClaudeMascot() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {/* Head: top row */}
      <rect x="4" y="4" width="16" height="2" />
      {/* Eye row — solid except two gaps for the eyes */}
      <rect x="4" y="6" width="2" height="2" />
      <rect x="8" y="6" width="8" height="2" />
      <rect x="18" y="6" width="2" height="2" />
      {/* Head: row below eyes */}
      <rect x="4" y="8" width="16" height="2" />
      {/* Body: wider, two rows tall */}
      <rect x="2" y="10" width="20" height="4" />
      {/* Four legs */}
      <rect x="2" y="14" width="2" height="4" />
      <rect x="6" y="14" width="2" height="4" />
      <rect x="16" y="14" width="2" height="4" />
      <rect x="20" y="14" width="2" height="4" />
    </svg>
  );
}

export function IconTerminal() {
  return (
    <IconShell>
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    </IconShell>
  );
}

export function IconFolderOpen() {
  return (
    <IconShell>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </IconShell>
  );
}

export function IconGlobe() {
  return (
    <IconShell>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </IconShell>
  );
}

export function IconSplit() {
  return (
    <IconShell>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
    </IconShell>
  );
}

