import { useEffect, useRef, useState } from "react";
import { Zap, ArrowDown, Trophy } from "lucide-react";
import { ModelIcon } from "./composer/icons";
import { MarkdownMessage } from "./MarkdownMessage";
import type { ChatPane } from "../types";

export interface ComparisonPaneProps {
  pane: ChatPane;
  index: number;
  isFastestTtft: boolean;
  isMaxSpeed: boolean;
}

export function ComparisonPane({
  pane,
  index,
  isFastestTtft,
  isMaxSpeed,
}: ComparisonPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Monitor per-pane scroll: if scrolled up past 140px, don't force-scroll down
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsUserScrolledUp(distanceFromBottom > 140);
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setIsUserScrolledUp(false);
  };

  // Auto-scroll when new tokens arrive, isolated to this pane
  useEffect(() => {
    if (!isUserScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [pane.streamingContent, isUserScrolledUp]);

  return (
    <div
      data-testid={`comparison-pane-${index}`}
      className={`relative rounded-2xl border bg-[var(--bg-panel-2)] p-4 shadow-md flex flex-col justify-between transition-all ${
        isFastestTtft || isMaxSpeed
          ? "border-[var(--lime)] shadow-sm"
          : "border-[var(--border-strong)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--border-subtle)] text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ModelIcon type={pane.modelId} className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold text-[var(--text-primary)] truncate max-w-[130px]">
            #{index + 1} · {pane.modelLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isFastestTtft && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
              <Trophy className="w-2.5 h-2.5" />
              <span>Fastest TTFT</span>
            </span>
          )}
          {isMaxSpeed && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
              <Zap className="w-2.5 h-2.5" />
              <span>Max Speed</span>
            </span>
          )}
          {pane.streaming ? (
            <span className="text-[10px] text-[var(--lime-text)] animate-pulse flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--lime-text)]" />
              Streaming…
            </span>
          ) : (
            <span className="text-[10px] text-neutral-400 font-mono">Ready</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid={`pane-scroll-${index}`}
        className="flex-1 min-h-[120px] max-h-[420px] overflow-y-auto text-sm"
      >
        {pane.streamingContent ? (
          <>
            <MarkdownMessage content={pane.streamingContent} />
            {pane.streaming && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--lime-text)] animate-pulse align-middle" />
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)] animate-pulse">
            Waiting for tokens…
          </div>
        )}
      </div>

      {/* Floating scroll to latest button */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          title="Scroll to latest"
          aria-label="Scroll to latest"
          data-testid={`scroll-latest-${index}`}
          className="absolute right-4 bottom-12 p-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-panel-2)] text-[var(--lime-text)] shadow-md hover:bg-[var(--hover-overlay)] transition-all z-20 flex items-center justify-center cursor-pointer animate-bounce"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Live metrics footer */}
      {pane.metrics && (
        <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
          <span className={isMaxSpeed ? "text-amber-500 font-semibold" : ""}>
            {pane.metrics.tokensPerSecond
              ? `${pane.metrics.tokensPerSecond.toFixed(1)} tok/s`
              : "—"}
          </span>
          <span className={isFastestTtft ? "text-emerald-500 font-semibold" : ""}>
            {pane.metrics.ttftMs ? `${pane.metrics.ttftMs}ms` : "—"}
          </span>
          <span>
            {pane.metrics.outputTokens ? `${pane.metrics.outputTokens} tok` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
