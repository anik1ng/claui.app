import { useState } from 'react';
import type { StatusUpdate } from '../ipc/commands';
import { useListen } from '../notify/useListen';
import { nextRateLimits, type RateLimits } from './rateLimits';

/**
 * Tracks the account-global 5h/7d rate limits from the freshest `status:update`
 * that carries them (see `nextRateLimits`). The StatusBar uses these for the
 * limit chips while taking model/context/cost from the active tab — limits are
 * account-wide and must stay consistent when you switch tabs.
 */
export function useGlobalRateLimits(): RateLimits | null {
  const [limits, setLimits] = useState<RateLimits | null>(null);
  useListen<StatusUpdate>('status:update', (e) => {
    setLimits((prev) => nextRateLimits(prev, e.payload.status));
  });
  return limits;
}
