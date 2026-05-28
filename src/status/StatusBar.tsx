import { useEffect, useState } from 'react';
import type { StatusPayload } from '../ipc/commands';
import { formatPct, formatTimeUntil, formatUsd, limitLevel } from './statusFormat';
import './StatusBar.css';

interface Props {
  status: StatusPayload | null;
}

/**
 * Wall-clock seconds, ticked every 30s. Minute resolution is enough for the
 * "resets in Xh Ym" chips, so we'd rather refresh at half-minute cadence than
 * burn 1Hz re-renders across every open project's status bar.
 */
function useNowSec(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * The top status bar — claui's native surface for the live Claude Code state
 * captured from `claude`'s statusline JSON. Layout B: context on the left;
 * the 5h / 7d limits, cost, and model grouped on the right.
 *
 * Every slot renders even before any `status:update` arrives — missing fields
 * fall back to zero / `—`. This keeps the bar from "flickering in" on first
 * launch and avoids the visual jump when claude's first turn reports values.
 */
export function StatusBar({ status }: Props) {
  const context = status?.contextPct ?? 0;
  const fiveHour = status?.fiveHourPct ?? 0;
  const sevenDay = status?.sevenDayPct ?? 0;
  const fiveHourResets = status?.fiveHourResetsAt ?? null;
  const sevenDayResets = status?.sevenDayResetsAt ?? null;
  const cost = status?.costUsd ?? 0;
  const model = status?.model ?? '—';
  const nowSec = useNowSec();

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <span className="statusbar-label">Context</span>
        <span className="statusbar-ctxbar">
          <span
            className="statusbar-ctxfill"
            style={{ width: `${Math.min(context, 100)}%` }}
          />
        </span>
        <span>{formatPct(context)}</span>
      </div>
      <div className="statusbar-right">
        <span className={`statusbar-limit level-${limitLevel(fiveHour)}`}>
          <span className="statusbar-label">5h</span> {formatPct(fiveHour)}
          {fiveHourResets != null && (
            <span className="statusbar-reset"> · {formatTimeUntil(fiveHourResets, nowSec)}</span>
          )}
        </span>
        <span className={`statusbar-limit level-${limitLevel(sevenDay)}`}>
          <span className="statusbar-label">7d</span> {formatPct(sevenDay)}
          {sevenDayResets != null && (
            <span className="statusbar-reset"> · {formatTimeUntil(sevenDayResets, nowSec)}</span>
          )}
        </span>
        <span className="statusbar-cost">{formatUsd(cost)}</span>
        <span className="statusbar-model">{model}</span>
      </div>
    </div>
  );
}
