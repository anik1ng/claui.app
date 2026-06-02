import { useEffect } from 'react';

/**
 * Calls `onFocus` / `onBlur` when the window gains or loses focus. Extracted so
 * App's body stays under the lint length limit; the notify clearing-on-focus
 * behaviour lives in `useNotifyByProject`.
 */
export function useWindowFocus(onFocus: () => void, onBlur: () => void): void {
  useEffect(() => {
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [onFocus, onBlur]);
}
