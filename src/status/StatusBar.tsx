import type { StatusPayload } from '../ipc/commands';
import { formatPct, formatUsd, limitLevel } from './statusFormat';
import './StatusBar.css';

interface Props {
  status: StatusPayload | null;
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
  const cost = status?.costUsd ?? 0;
  const model = status?.model ?? '—';

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
        </span>
        <span className={`statusbar-limit level-${limitLevel(sevenDay)}`}>
          <span className="statusbar-label">7d</span> {formatPct(sevenDay)}
        </span>
        <span className="statusbar-cost">{formatUsd(cost)}</span>
        <span className="statusbar-model">{model}</span>
      </div>
    </div>
  );
}
