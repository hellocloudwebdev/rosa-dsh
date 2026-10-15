import type { TurnMetrics } from "../../../shared/types.js";
import { cn } from "../../lib/cn.js";
import { formatContextWindow, formatMs, formatTokens, formatTokensPerSecond } from "../../lib/format.js";
import { EstimatedTag, UnknownTag } from "../ui/Button.js";

export interface MetricsRowProps {
  metrics: Omit<TurnMetrics, "startedAt" | "endedAt"> | null;
  contextWindow: number | null;
  /** Hide the labels and show only values, for very narrow panes. */
  compact?: boolean;
}

/**
 * One turn's metrics.
 *
 * Every value is either a real measurement or an explicit "unknown" chip — no
 * zeros stand in for missing data, and locally-computed values carry an `est.`
 * marker.
 */
export function MetricsRow({ metrics, contextWindow, compact = false }: MetricsRowProps) {
  if (!metrics) {
    return (
      <p className="text-[11px] text-ink-faint">
        Metrics appear once the response finishes.
      </p>
    );
  }

  const estimated = metrics.outputTokensEstimated || metrics.inputTokensEstimated;

  return (
    <dl className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", compact ? "text-[11px]" : "text-[12px]")}>
      <Metric
        label="TTFT"
        value={formatMs(metrics.ttftMs)}
        unknown={metrics.ttftMs === null}
      />
      <Metric
        label="to 1st content"
        value={formatMs(metrics.firstResponseMs)}
        unknown={metrics.firstResponseMs === null}
      />
      <Metric
        label="total"
        value={formatMs(metrics.totalMs)}
        unknown={metrics.totalMs === null}
      />
      <Metric
        label="speed"
        value={metrics.tokensPerSecondEstimated ? formatTokensPerSecond(metrics.tokensPerSecond) : formatTokensPerSecond(metrics.tokensPerSecond)}
        unknown={metrics.tokensPerSecond === null}
        estimated={metrics.tokensPerSecondEstimated}
      />
      <Metric
        label="tokens"
        value={
          metrics.outputTokens === null
            ? "unknown"
            : `${formatTokens(metrics.inputTokens)} in / ${formatTokens(metrics.outputTokens)} out`
        }
        unknown={metrics.outputTokens === null}
        estimated={estimated}
      />
      <Metric
        label="context"
        value={formatContextWindow(contextWindow)}
        unknown={contextWindow === null}
      />

      {estimated ? (
        <span className="flex items-center gap-1 text-[10px] text-ink-faint">
          <EstimatedTag />
          locally derived
        </span>
      ) : null}
    </dl>
  );
}

function Metric({
  label,
  value,
  unknown = false,
  estimated = false,
}: {
  label: string;
  value: string;
  unknown?: boolean;
  estimated?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="flex items-center gap-1 font-medium tabular-nums text-ink-muted">
        {unknown ? <UnknownTag /> : value}
        {estimated && !unknown ? <EstimatedTag /> : null}
      </dd>
    </div>
  );
}

/** Compact side-by-side metric table for the comparison workspace. */
export function ComparisonMetrics({
  entries,
}: {
  entries: Array<{
    paneId: number;
    label: string;
    metrics: Omit<TurnMetrics, "startedAt" | "endedAt"> | null;
    contextWindow: number | null;
  }>;
}) {
  if (entries.length === 0) return null;

  const rows: Array<{ key: string; label: string; get: (entry: (typeof entries)[number]) => string | null }> = [
    { key: "ttft", label: "Time to first token", get: (e) => (e.metrics ? formatMs(e.metrics.ttftMs) : null) },
    { key: "first", label: "Time to first content", get: (e) => (e.metrics ? formatMs(e.metrics.firstResponseMs) : null) },
    { key: "total", label: "Total time", get: (e) => (e.metrics ? formatMs(e.metrics.totalMs) : null) },
    { key: "speed", label: "Tokens / second", get: (e) => (e.metrics ? formatTokensPerSecond(e.metrics.tokensPerSecond) : null) },
    { key: "tokens", label: "Tokens in / out", get: (e) => (e.metrics ? `${formatTokens(e.metrics.inputTokens)} / ${formatTokens(e.metrics.outputTokens)}` : null) },
    { key: "context", label: "Context window", get: (e) => formatContextWindow(e.contextWindow) },
  ];

  return (
    <div className="table-scroll overflow-hidden rounded-xl border border-line-subtle bg-surface-raised">
      <table className="w-full border-collapse text-[12px]">
        <caption className="sr-only">
          Measured metrics for each model in this comparison. Unknown values are
          marked rather than shown as zero.
        </caption>
        <thead>
          <tr className="border-b border-line-subtle bg-surface-sunken">
            <th scope="col" className="px-3 py-2 text-left font-medium text-ink-muted">
              Metric
            </th>
            {entries.map((entry) => (
              <th key={entry.paneId} scope="col" className="px-3 py-2 text-left font-medium text-ink-strong">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-faint">
                {row.label}
              </th>
              {entries.map((entry) => {
                const raw = row.get(entry);
                return (
                  <td key={entry.paneId} className="px-3 py-1.5 tabular-nums text-ink-muted">
                    {raw === null ? <UnknownTag /> : raw}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
