// src/tabs/HoverToolbar.tsx
import './HoverToolbar.css';

interface Props {
  /** Open a new claude tab. */
  onClaude: () => void;
  /** Open a new shell tab. */
  onTerminal: () => void;
}

/**
 * The icon strip at the right end of the workspace tab bar.
 * Hidden by default, fades in on hover of the surrounding tab bar.
 * Two active icons in 3a (claude, terminal); browser and split panes
 * appear as disabled placeholder slots so the visual real estate is
 * already reserved for later phases.
 */
export function HoverToolbar({ onClaude, onTerminal }: Props) {
  return (
    <div className="hover-toolbar" role="toolbar" aria-label="Open new tab">
      <button
        type="button"
        className="ht-icon"
        title="New claude tab (⌘T)"
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
        <span aria-hidden>{'>_'}</span>
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
