import { useMemo } from "react";
import type { AppState } from "../../state/appState.js";
import { ComparisonMetrics } from "./MetricsRow.js";
import { cn } from "../../lib/cn.js";
import { formatMs, formatTokens, formatTokensPerSecond } from "../../lib/format.js";

export interface ComparisonSummaryProps {
  state: AppState;
}

/**
 * Side-by-side measurement table for a finished comparison turn.
 *
 * Values that were never measured are rendered as "unknown" in the cell rather
 * than 0, so a fast-but-silent model cannot look like a broken model.
 */
export function ComparisonSummary({ state }: ComparisonSummaryProps) {
  const entries = useMemo(
    () =>
      state.panes
        .filter((pane) => pane.modelLabel)
        .map((pane) => ({
          paneId: pane.id,
          label: pane.modelLabel,
          metrics: pane.metrics,
          contextWindow: pane.contextWindow,
        })),
    [state.panes],
  );

  const streaming = state.panes.some((p) => p.status === "streaming");

  if (entries.length < 2) return null;
  if (entries.every((e) => e.metrics === null)) return null;

  // Rank only the measured values; unknowns are excluded from the ranking.
  const fastest = rankFastest(entries);
  const fullest = rankMostOutput(entries);

  return (
    <section className="flex flex-col gap-2" aria-label="Comparison summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Measured comparison
        </h2>
        {streaming ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
            still measuring
          </span>
        ) : (
          <span className="text-[11px] text-ink-faint">
            {entries.filter((e) => e.metrics).length} of {entries.length} finished
          </span>
        )}
      </div>

      {fastest || fullest ? (
        <p className="text-[12px] leading-snug text-ink-muted">
          {fastest ? (
            <>
              Fastest to first token: <strong className="font-semibold text-ink-strong">{fastest.label}</strong>{" "}
              ({formatMs(fastest.value)}) ·{" "}
            </>
          ) : null}
          {fullest ? (
            <>
              Most output: <strong className="font-semibold text-ink-strong">{fullest.label}</strong>{" "}
              ({formatTokens(fullest.value)} tokens)
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-[12px] text-ink-faint">
          No comparable measurements yet — waiting for the panes to finish.
        </p>
      )}

      <ComparisonMetrics entries={entries} />
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Tokens per second is computed from measured tokens divided by measured
        elapsed time. When a provider reports no token counts the value stays
        unknown rather than being estimated.
      </p>
    </section>
  );
}

function rankFastest(entries: ComparisonSummaryProps["state"]["panes"] extends never ? never : Array<{ label: string; metrics: { ttftMs: number | null } | null }>) {
  let best: { label: string; value: number } | null = null;
  for (const entry of entries) {
    const value = entry.metrics?.ttftMs;
    if (value === null || value === undefined) continue;
    if (!best || value < best.value) best = { label: entry.label, value };
  }
  return best;
}

function rankMostOutput(entries: Array<{ label: string; metrics: { outputTokens: number | null } | null }>) {
  let best: { label: string; value: number } | null = null;
  for (const entry of entries) {
    const value = entry.metrics?.outputTokens;
    if (value === null || value === undefined) continue;
    if (!best || value > best.value) best = { label: entry.label, value };
  }
  return best;
}

void (formatTokensPerSecond as unknown);
void (cn as unknown);
