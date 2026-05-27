import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import './ListRow.css';

/**
 * The event passed to `onClick`. Union so handlers that care about modifier
 * keys (e.g. session rows treating Cmd+click as "open in new tab") can read
 * `e.metaKey` regardless of whether the user clicked or activated via
 * keyboard — both React event types expose `metaKey`.
 */
export type ListRowActivateEvent = ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>;

interface Props {
  label: string;
  /** Right-aligned dim text (e.g. timestamp). Omit for rows without metadata. */
  meta?: string;
  /** Optional secondary indicator (e.g. "session is currently open in some tab"). */
  badge?: 'open';
  isActive: boolean;
  onClick: (e: ListRowActivateEvent) => void;
  /** When provided, renders a hover-revealed `×` button on the right. */
  onClose?: () => void;
  /** Tooltip text (e.g. full path for project rows). */
  title?: string;
}

/**
 * One row in the right sidebar. Same visual pattern for both project rows and
 * session rows — accent strip on the left when active, label + optional meta
 * on the right, hover-revealed close button.
 *
 * The row is a `<div role="button">` rather than a `<button>` so the close
 * `<button>` can live inside it without invalid nesting (interactive elements
 * inside a button are not allowed).
 */
export function ListRow({ label, meta, badge, isActive, onClick, onClose, title }: Props) {
  return (
    <div
      className={isActive ? 'list-row active' : 'list-row'}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
      role="button"
      tabIndex={0}
      title={title}
    >
      <span className="list-row-label">{label}</span>
      {badge === 'open' && (
        <span className="list-row-badge" title="Open in a tab" aria-hidden>
          ↗
        </span>
      )}
      {meta && <span className="list-row-meta">{meta}</span>}
      {onClose && (
        <button
          type="button"
          className="list-row-close"
          aria-label="Close"
          title="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
