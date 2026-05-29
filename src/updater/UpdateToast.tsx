import { useEffect } from 'react';
import type { UpdaterToast } from './useUpdaterCheck';
import './UpdateToast.css';

interface Props {
  toast: UpdaterToast;
  onInstall: () => void;
  onDismiss: () => void;
}

/** How long the transient confirmation / error toasts linger before self-dismiss. */
const AUTO_DISMISS_MS: Partial<Record<NonNullable<UpdaterToast>['kind'], number>> = {
  'up-to-date': 4_000,
  error: 6_000,
};

/**
 * Bottom-left updater toast, rendered once at the App level (updates are
 * window-global, not per-project). `available` and `installing` persist until
 * the user acts or the app relaunches; the transient `up-to-date` / `error`
 * states fade themselves out after {@link AUTO_DISMISS_MS}.
 */
export function UpdateToast({ toast, onInstall, onDismiss }: Props) {
  const autoDismiss = toast ? AUTO_DISMISS_MS[toast.kind] : undefined;
  useEffect(() => {
    if (autoDismiss === undefined) return;
    const t = setTimeout(onDismiss, autoDismiss);
    return () => clearTimeout(t);
  }, [autoDismiss, onDismiss]);

  if (!toast) return null;

  return (
    <div className="update-toast" role="status">
      {toast.kind === 'available' && (
        <>
          <span className="update-toast-text">
            <strong>claui {toast.version}</strong> is available
          </span>
          <button type="button" className="update-toast-action" onClick={onInstall}>
            Install on restart
          </button>
          <button
            type="button"
            className="update-toast-close"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            ×
          </button>
        </>
      )}
      {toast.kind === 'installing' && (
        <span className="update-toast-text">Downloading update…</span>
      )}
      {toast.kind === 'up-to-date' && (
        <span className="update-toast-text">You’re up to date</span>
      )}
      {toast.kind === 'error' && (
        <>
          <span className="update-toast-text">Update failed: {toast.message}</span>
          <button
            type="button"
            className="update-toast-close"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
