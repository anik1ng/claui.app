import { useCallback, useEffect, useState } from 'react';
import { getCapabilities } from '../ipc/commands';
import { useWindowFocus } from '../notify/useWindowFocus';
import { EMPTY_CAPABILITIES, type Capabilities } from './types';

/**
 * The active project's capabilities, fetched on mount and re-fetched on window
 * focus (config changes rarely, so polling/file-watching would be overkill).
 * `enabled` gates the fetch to the active project — every open project mounts a
 * ProjectArea, but only the visible one should hit the backend.
 */
export function useCapabilities(path: string, enabled: boolean): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(EMPTY_CAPABILITIES);

  const refresh = useCallback(() => {
    if (!enabled) return;
    getCapabilities(path)
      .then(setCaps)
      .catch(() => setCaps(EMPTY_CAPABILITIES));
  }, [path, enabled]);

  useEffect(refresh, [refresh]);
  useWindowFocus(refresh, noop);

  return caps;
}

function noop() {}
