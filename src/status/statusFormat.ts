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
