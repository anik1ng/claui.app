export type LimitLevel = 'ok' | 'warn' | 'high';

/**
 * Colour band for a usage percentage — green below 50, yellow below 80, red
 * at or above 80. Mirrors `claude`'s own statusline thresholds.
 */
export function limitLevel(pct: number): LimitLevel {
  if (pct >= 80) return 'high';
  if (pct >= 50) return 'warn';
  return 'ok';
}

/** Format a USD amount as `$0.47`. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format a percentage as a rounded integer with a `%` suffix. */
export function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

/**
 * Compact "time remaining" between a future Unix-epoch seconds timestamp and
 * a caller-supplied `nowSec`. Minute resolution by design — the status bar
 * renders this in a chip whose width should not jitter every second.
 *
 *   < 0 (past)  → "now"
 *   < 60s       → "<1m"
 *   < 1h        → "23m"
 *   >= 1h       → "1h 23m"
 *
 * `nowSec` is injected (not read from `Date.now()`) so the StatusBar can
 * tick all chips off one shared clock value and the formatter stays pure.
 */
export function formatTimeUntil(resetsAt: number, nowSec: number): string {
  const sec = resetsAt - nowSec;
  if (sec <= 0) return 'now';
  if (sec < 60) return '<1m';
  const totalMin = Math.floor(sec / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${totalMin}m`;
}
