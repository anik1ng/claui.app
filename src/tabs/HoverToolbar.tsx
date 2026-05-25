// src/tabs/HoverToolbar.tsx
import './HoverToolbar.css';

interface Props {
  /** Open a new claude tab. */
  onClaude: () => void;
  /** Open a new shell tab. */
  onTerminal: () => void;
  /** Replace the current project with another one (same as File → Open Project). */
  onOpenProject: () => void;
}

/**
 * The icon strip at the right end of the workspace tab bar — always
 * visible (it's the only mouse affordance for creating new tabs and
 * switching projects when the tab strip itself is hidden by the
 * single-tab collapse).
 *
 * Live in 3a: claude, terminal, open-project. Browser and split-pane are
 * placeholder slots that reserve visual real estate for later phases.
 *
 * The name `HoverToolbar` is historical — the toolbar used to fade in on
 * `:hover` of the parent. It went baseline-visible when the tab strip
 * started hiding on `tabs.length <= 1`; the toolbar became the only chrome
 * left for those single-tab states, so hiding it on hover would have
 * meant "no mouse path to add a tab" — unacceptable.
 */
export function HoverToolbar({ onClaude, onTerminal, onOpenProject }: Props) {
  return (
    <div className="hover-toolbar" role="toolbar" aria-label="Tab actions">
      <button
        type="button"
        className="ht-icon"
        title="New Claude tab (⌘T)"
        onClick={onClaude}
      >
        <span aria-hidden>✦</span>
      </button>
      <button
        type="button"
        className="ht-icon"
        title="New terminal tab (⌘⇧T)"
        onClick={onTerminal}
      >
        <span aria-hidden>{'❯_'}</span>
      </button>
      <button
        type="button"
        className="ht-icon"
        title="Open project — replaces current (⌘O)"
        onClick={onOpenProject}
      >
        <span aria-hidden>⊞</span>
      </button>
      <span className="ht-icon ht-disabled" title="Browser (coming later)" aria-disabled>
        <span aria-hidden>◐</span>
      </span>
      <span className="ht-icon ht-disabled" title="Split pane (coming later)" aria-disabled>
        <span aria-hidden>▦</span>
      </span>
    </div>
  );
}
