import { useState, type ReactNode } from "react";
import {
  BarChart2,
  GitCompare,
  FileText,
  Code2,
  Zap,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import type { ViewType, ChatPane, Msg } from "../../types";
import type { TurnMetrics } from "@shared/types.js";

export interface ViewProps {
  panes: ChatPane[];
  messages: Msg[];
  latestMetrics?: TurnMetrics | null;
  isLoading: boolean;
}

export const VIEW_LIST: { type: ViewType; label: string; icon: ReactNode }[] = [
  { type: "inspector", label: "Metrics & Inspector", icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { type: "diff", label: "Side-by-Side Diff", icon: <GitCompare className="w-3.5 h-3.5" /> },
  { type: "markdown", label: "Raw Markdown", icon: <FileText className="w-3.5 h-3.5" /> },
  { type: "json", label: "JSON Event Trace", icon: <Code2 className="w-3.5 h-3.5" /> },
];

export function viewMeta(t: ViewType) {
  return VIEW_LIST.find((v) => v.type === t) ?? VIEW_LIST[0];
}

/* ------------------------------------------------------------------ */
/* Inspector & Metrics View                                           */
/* ------------------------------------------------------------------ */

export function InspectorView({ panes, messages }: ViewProps) {
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
          Performance Benchmarking
        </h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Real-time TTFT, generation velocity, and token efficiency metrics
        </p>
      </div>

      {/* Comparison metrics table if multiple panes */}
      <div className="space-y-3">
        {panes.map((p, idx) => {
          const m = p.metrics;
          return (
            <div
              key={p.id}
              className="p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel-2)] space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-xs">
                <span className="font-semibold text-[var(--text-primary)]">
                  Pane #{idx + 1}: {p.modelLabel}
                </span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {p.providerId}
                </span>
              </div>

              {m ? (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      Speed
                    </span>
                    <div className="text-base font-bold font-mono text-[var(--lime-text)]">
                      {m.tokensPerSecond ? `${m.tokensPerSecond.toFixed(1)} tok/s` : "—"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      TTFT
                    </span>
                    <div className="text-base font-bold font-mono text-[var(--text-primary)]">
                      {m.ttftMs ? `${m.ttftMs}ms` : "—"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                      Output Tokens
                    </span>
                    <div className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                      {m.outputTokens ?? "—"}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                      Duration
                    </span>
                    <div className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                      {m.totalMs ? `${(m.totalMs / 1000).toFixed(2)}s` : "—"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-400 py-3 text-center">
                  Send a prompt to measure performance
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lastAssistantMsg?.metrics && (
        <div className="p-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel-2)] text-xs space-y-2">
          <div className="font-semibold text-[var(--text-primary)]">Latest Assistant Turn Summary</div>
          <div className="flex justify-between text-neutral-400 font-mono text-[11px]">
            <span>Model:</span>
            <span>{lastAssistantMsg.modelLabel || lastAssistantMsg.modelId}</span>
          </div>
          <div className="flex justify-between text-neutral-400 font-mono text-[11px]">
            <span>First Token Latency:</span>
            <span>{lastAssistantMsg.metrics.ttftMs}ms</span>
          </div>
          <div className="flex justify-between text-neutral-400 font-mono text-[11px]">
            <span>Velocity:</span>
            <span>{lastAssistantMsg.metrics.tokensPerSecond?.toFixed(1)} tok/s</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diff View (Comparing responses)                                    */
/* ------------------------------------------------------------------ */

export function DiffView({ panes, messages }: ViewProps) {
  const p1Text = panes[0]?.streamingContent || messages.filter((m) => m.role === "assistant" && (!m.paneIndex || m.paneIndex === 0)).slice(-1)[0]?.text || "";
  const p2Text = panes[1]?.streamingContent || messages.filter((m) => m.role === "assistant" && m.paneIndex === 1).slice(-1)[0]?.text || "";

  if (!p1Text && !p2Text) {
    return (
      <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <GitCompare className="w-8 h-8 mx-auto opacity-50" />
        <p>No model responses to compare yet.</p>
        <p>Switch to 2x Panes and send a prompt to inspect textual differences.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)]">
        <span>Pane 1 ({panes[0]?.modelLabel}) vs Pane 2 ({panes[1]?.modelLabel})</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
        <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[#121613] overflow-x-auto max-h-[500px]">
          <div className="font-semibold text-emerald-400 pb-2 border-b border-white/5 mb-2">
            Pane 1: {panes[0]?.modelLabel}
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed text-neutral-300">
            {p1Text || "No content"}
          </pre>
        </div>

        <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[#121613] overflow-x-auto max-h-[500px]">
          <div className="font-semibold text-blue-400 pb-2 border-b border-white/5 mb-2">
            Pane 2: {panes[1]?.modelLabel}
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed text-neutral-300">
            {p2Text || "No content"}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raw Markdown View                                                  */
/* ------------------------------------------------------------------ */

export function MarkdownView({ messages }: ViewProps) {
  const [copied, setCopied] = useState(false);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const text = lastAssistant?.text || "No assistant message yet.";

  return (
    <div className="space-y-3 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)] font-mono">raw-response.md</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] text-[var(--text-secondary)] transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy Markdown"}</span>
        </button>
      </div>

      <pre className="p-4 rounded-xl border border-[var(--border-strong)] bg-[#121613] text-neutral-200 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto">
        {text}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* JSON Event Trace View                                               */
/* ------------------------------------------------------------------ */

export function JsonView({ panes, messages, latestMetrics }: ViewProps) {
  const jsonStr = JSON.stringify(
    {
      latestMetrics,
      panes: panes.map((p) => ({
        id: p.id,
        modelId: p.modelId,
        providerId: p.providerId,
        metrics: p.metrics,
      })),
      recentMessageCount: messages.length,
      lastTurn: messages.slice(-2),
    },
    null,
    2,
  );

  return (
    <div className="space-y-3 max-w-xl mx-auto">
      <div className="text-xs text-[var(--text-muted)] font-mono">event-trace.json</div>
      <pre className="p-4 rounded-xl border border-[var(--border-strong)] bg-[#121613] text-emerald-400 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[550px]">
        {jsonStr}
      </pre>
    </div>
  );
}
