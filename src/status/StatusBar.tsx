import type { StatusPayload } from '../ipc/commands';
import { formatPct, formatUsd, limitLevel } from './statusFormat';
import './StatusBar.css';

interface Props {
  status: StatusPayload | null;
}

/**
 * The top status bar — claui's native surface for the live Claude Code state
 * captured from `claude`'s statusline JSON. Layout B: context on the left;
 * the 5h / 7d limits, cost, and model grouped on the right. A metric that is
 * absent renders nothing, so the bar degrades gracefully.
 */
export function StatusBar({ status }: Props) {
  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {status?.contextPct != null && (
          <>
            <span className="statusbar-label">Context</span>
            <span className="statusbar-ctxbar">
              <span
                className="statusbar-ctxfill"
                style={{ width: `${Math.min(status.contextPct, 100)}%` }}
              />
            </span>
            <span>{formatPct(status.contextPct)}</span>
          </>
        )}
      </div>
      <div className="statusbar-right">
        {status?.fiveHourPct != null && (
          <span className={`statusbar-limit level-${limitLevel(status.fiveHourPct)}`}>
            <span className="statusbar-label">5h</span> {formatPct(status.fiveHourPct)}
          </span>
        )}
        {status?.sevenDayPct != null && (
          <span className={`statusbar-limit level-${limitLevel(status.sevenDayPct)}`}>
            <span className="statusbar-label">7d</span> {formatPct(status.sevenDayPct)}
          </span>
        )}
        {status?.costUsd != null && (
          <span className="statusbar-cost">{formatUsd(status.costUsd)}</span>
        )}
        {status?.model != null && <span className="statusbar-model">{status.model}</span>}
      </div>
    </div>
  );
}
