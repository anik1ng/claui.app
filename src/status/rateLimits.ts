import type { StatusPayload } from '../ipc/commands';

/** The account-global rate-limit slice of a status payload. These limits are
 *  the same across every session/tab/project, so the StatusBar sources them
 *  from the freshest payload that carries them, not from the active tab. */
export interface RateLimits {
  fiveHourPct: number | null;
  fiveHourResetsAt: number | null;
  sevenDayPct: number | null;
  sevenDayResetsAt: number | null;
}

function rateLimitsEqual(a: RateLimits, b: RateLimits): boolean {
  return (
    a.fiveHourPct === b.fiveHourPct &&
    a.fiveHourResetsAt === b.fiveHourResetsAt &&
    a.sevenDayPct === b.sevenDayPct &&
    a.sevenDayResetsAt === b.sevenDayResetsAt
  );
}

/** A StatusPayload with every field null — the base for showing account-global
 *  limits when there is no active-tab payload (a shell tab, or a claude tab
 *  before its first statusline write). */
const EMPTY_STATUS: StatusPayload = {
  sessionId: null,
  model: null,
  contextPct: null,
  costUsd: null,
  fiveHourPct: null,
  fiveHourResetsAt: null,
  sevenDayPct: null,
  sevenDayResetsAt: null,
};

/**
 * Overlay the account-global rate limits onto a per-tab status payload for
 * display. Keeps model/context/cost from the tab; only the 5h/7d limit fields
 * come from `limits`. When there is no active-tab payload (shell tab, or a
 * claude tab before its first statusline write) but limits ARE known, returns a
 * limits-only payload so the account-global chips still render rather than the
 * whole bar going blank. Returns the tab payload unchanged when no limits.
 */
export function withGlobalLimits(
  tabStatus: StatusPayload | null,
  limits: RateLimits | null,
): StatusPayload | null {
  if (!limits) return tabStatus;
  return { ...(tabStatus ?? EMPTY_STATUS), ...limits };
}

/**
 * Fold a status payload into the global rate-limit cache. Payloads with no
 * limits at all (a fresh/idle tab reports null) leave the cache unchanged.
 * Merges PER WINDOW: a payload carrying only one window (5h or 7d) updates that
 * window and keeps the other window's last-known values — it must never clobber
 * a known limit to null. Returns the SAME reference when nothing changed, so it
 * doesn't churn React renders.
 */
export function nextRateLimits(prev: RateLimits | null, s: StatusPayload): RateLimits | null {
  const hasFive = s.fiveHourPct != null;
  const hasSeven = s.sevenDayPct != null;
  if (!hasFive && !hasSeven) return prev;
  const candidate: RateLimits = {
    fiveHourPct: hasFive ? s.fiveHourPct : prev?.fiveHourPct ?? null,
    fiveHourResetsAt: hasFive ? s.fiveHourResetsAt : prev?.fiveHourResetsAt ?? null,
    sevenDayPct: hasSeven ? s.sevenDayPct : prev?.sevenDayPct ?? null,
    sevenDayResetsAt: hasSeven ? s.sevenDayResetsAt : prev?.sevenDayResetsAt ?? null,
  };
  if (prev && rateLimitsEqual(prev, candidate)) return prev;
  return candidate;
}
