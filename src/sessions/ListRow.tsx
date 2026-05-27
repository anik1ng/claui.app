import './ListRow.css';

interface Props {
  label: string;
  /** Right-aligned dim text (e.g. timestamp). Omit for rows without metadata. */
  meta?: string;
  /** Optional secondary indicator (e.g. "session is currently open in some tab"). */
  badge?: 'open';
  isActive: boolean;
  onClick: () => void;
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
          onClick();
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
