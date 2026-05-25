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

export function IconSparkles() {
  return (
    <IconShell>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </IconShell>
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
