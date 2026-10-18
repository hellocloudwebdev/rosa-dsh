import { useEffect, useRef, useState, useMemo } from "react";
import {
  Sparkles,
  Zap,
  Clock,
  BarChart2,
  Copy,
  Check,
  Scale,
  Brain,
  Code2,
  Terminal,
  ArrowDown,
} from "lucide-react";
import type { ModelWithProvider } from "@shared/types.js";
import { Composer } from "./composer/Composer";
import type { Mode } from "./composer/ModeMenu";
import type { Theme } from "./Sidebar";
import type { Msg, ChatPane } from "../types";
import { ModelIcon } from "./composer/icons";
import { MarkdownMessage } from "./MarkdownMessage";
import { ModelMenu } from "./composer/ModelMenu";
import { ComparisonPane } from "./ComparisonPane";

interface PrimaryWorkspaceProps {
  messages: Msg[];
  isLoading: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  onCancelStream?: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  models: ModelWithProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (m: { providerId: string; modelId: string; label?: string }) => void;
  onToggleFavourite?: (providerId: string, modelId: string, current: boolean) => void;
  onOpenProvidersModal: () => void;
  paneCount: 1 | 2 | 3 | 4;
  panes: ChatPane[];
  onUpdatePaneModel: (paneIndex: number, model: { providerId: string; modelId: string; label?: string }) => void;
  temperature: number;
  onTemperatureChange: (t: number) => void;
  theme: Theme;
}

const DEFAULT_SUGGESTIONS = [
  {
    icon: Scale,
    title: "Side-by-Side Model Showdown",
    prompt: "Compare the reasoning differences between Claude 3.5 Sonnet and GPT-4o on designing a distributed cache.",
  },
  {
    icon: Code2,
    title: "Zero-Cost TypeScript Refactor",
    prompt: "Refactor this async handler to eliminate memory leaks and handle SSRF attacks safely.",
  },
  {
    icon: Brain,
    title: "First Principles Decomposition",
    prompt: "Explain how SQLite achieves ACID transactions via Write-Ahead Logging (WAL) from first principles.",
  },
  {
    icon: Terminal,
    title: "Local Ollama Benchmarking",
    prompt: "Benchmark reasoning throughput on my local Ollama model vs cloud models.",
  },
];

export function PrimaryWorkspace({
  messages,
  isLoading,
  prompt,
  onPromptChange,
  onSubmit,
  onCancelStream,
  mode,
  onModeChange,
  models,
  selectedModel,
  onSelectModel,
  onToggleFavourite,
  onOpenProvidersModal,
  paneCount,
  panes,
  onUpdatePaneModel,
  temperature,
  onTemperatureChange,
  theme,
}: PrimaryWorkspaceProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const activePanes = useMemo(() => panes.slice(0, paneCount), [panes, paneCount]);

  // Compute multi-pane benchmark winners
  const validTtftPanes = useMemo(
    () => activePanes.filter((p) => p.metrics?.ttftMs != null && p.metrics!.ttftMs! > 0),
    [activePanes],
  );
  const minTtft = useMemo(
    () => (validTtftPanes.length > 1 ? Math.min(...validTtftPanes.map((p) => p.metrics!.ttftMs!)) : null),
    [validTtftPanes],
  );

  const validSpeedPanes = useMemo(
    () => activePanes.filter((p) => p.metrics?.tokensPerSecond != null && p.metrics!.tokensPerSecond! > 0),
    [activePanes],
  );
  const maxSpeed = useMemo(
    () => (validSpeedPanes.length > 1 ? Math.max(...validSpeedPanes.map((p) => p.metrics!.tokensPerSecond!)) : null),
    [validSpeedPanes],
  );

  // Smart auto-scroll: don't force scroll if user scrolled up to read
  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsUserScrolledUp(distanceFromBottom > 140);
  };

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setIsUserScrolledUp(false);
  };

  useEffect(() => {
    if (!isUserScrolledUp) {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading, isUserScrolledUp]);

  const copyText = (id: string | number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllComparison = () => {
    const text = activePanes
      .map((p, idx) => `### Pane #${idx + 1}: ${p.modelLabel}\n\n${p.streamingContent || "No content"}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const isLight = theme === "light";

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-[var(--bg-app)] transition-colors duration-300 relative overflow-hidden">
      {/* Scrollable conversation thread */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          {/* Empty state when no conversation */}
          {messages.length === 0 && !isLoading && (
            <div className="py-12 text-center max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-[var(--lime)]/15 border border-[var(--lime)]/30 text-[var(--lime-text)] flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
                Rosa Multi-Model AI Workspace
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed">
                Connect your custom API keys or local Ollama endpoints. Chat with single models or compare multiple providers side-by-side with real metrics.
              </p>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {DEFAULT_SUGGESTIONS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        onPromptChange(s.prompt);
                      }}
                      className="p-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:border-[var(--lime)]/50 hover:bg-[var(--hover-overlay)] transition-all cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-4 h-4 text-[var(--lime-text)]" />
                        <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--lime-text)] transition-colors">
                          {s.title}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                        {s.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-[var(--hover-overlay)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                    <ModelIcon type={m.modelId || m.modelLabel || "bot"} className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-4 transition-all ${
                    isUser
                      ? "bg-[var(--lime)] text-white shadow-sm"
                      : "bg-[var(--bg-panel-2)] border border-[var(--border-strong)] text-[var(--text-primary)] shadow-sm"
                  }`}
                >
                  {/* Header on assistant messages */}
                  {!isUser && (
                    <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {m.modelLabel || m.modelId || "Assistant"}
                        </span>
                        {m.paneIndex !== null && m.paneIndex !== undefined && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-[var(--text-secondary)]">
                            Pane {m.paneIndex + 1}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => copyText(m.id, m.text)}
                        className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        title="Copy message"
                      >
                        {copiedId === m.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 text-[10px]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Body */}
                  {isUser ? (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  ) : (
                    <MarkdownMessage content={m.text} />
                  )}

                  {/* Metrics bar on assistant responses */}
                  {!isUser && m.metrics && (
                    <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-3 text-[11px] font-mono text-[var(--text-muted)]">
                      {m.metrics.tokensPerSecond !== null && (
                        <span className="inline-flex items-center gap-1 text-[var(--lime-text)] font-semibold">
                          <Zap className="w-3 h-3" />
                          <span>{m.metrics.tokensPerSecond.toFixed(1)} tok/s</span>
                        </span>
                      )}
                      {m.metrics.ttftMs !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>TTFT: {m.metrics.ttftMs}ms</span>
                        </span>
                      )}
                      {m.metrics.outputTokens !== null && (
                        <span className="inline-flex items-center gap-1">
                          <BarChart2 className="w-3 h-3" />
                          <span>{m.metrics.outputTokens} tokens</span>
                        </span>
                      )}
                      {m.metrics.totalMs !== null && (
                        <span>{(m.metrics.totalMs / 1000).toFixed(2)}s</span>
                      )}
                    </div>
                  )}

                  {/* Error display */}
                  {m.error && (
                    <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                      {m.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active Streaming in Multi-Pane or Single Pane */}
          {isLoading && (
            <div className="space-y-4 pt-2">
              {paneCount > 1 ? (
                /* Multi-Pane Live Comparison View */
                <div
                  className={`grid gap-4 ${
                    paneCount === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : paneCount === 3
                        ? "grid-cols-1 md:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                  }`}
                >
                  {activePanes.map((pane, idx) => {
                    const isFastestTtft = minTtft != null && pane.metrics?.ttftMs === minTtft;
                    const isMaxSpeed = maxSpeed != null && pane.metrics?.tokensPerSecond === maxSpeed;

                    return (
                      <ComparisonPane
                        key={pane.id}
                        pane={pane}
                        index={idx}
                        isFastestTtft={isFastestTtft}
                        isMaxSpeed={isMaxSpeed}
                      />
                    );
                  })}
                </div>
              ) : (
                /* Single Pane Live Stream */
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-xl bg-[var(--hover-overlay)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                    <ModelIcon
                      type={selectedModel?.modelId || "bot"}
                      className="w-3.5 h-3.5 text-[var(--lime-text)] animate-pulse"
                    />
                  </div>
                  <div className="max-w-[85%] rounded-2xl p-4 bg-[var(--bg-panel-2)] border border-[var(--border-strong)] text-[var(--text-primary)] shadow-sm">
                    {panes[0]?.streamingContent ? (
                      <>
                        <MarkdownMessage content={panes[0].streamingContent} />
                        <span className="inline-block w-1.5 h-4 ml-1 bg-[var(--lime-text)] animate-pulse align-middle" />
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--lime-text)] animate-ping" />
                        <span>Connecting to model provider…</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Jump to Bottom Button */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 text-neutral-800 dark:text-neutral-100 text-xs font-semibold shadow-lg hover:border-[var(--lime)] transition-all cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5 text-[var(--lime-text)]" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Pane Model Bar when in Multi-Pane Mode */}
      {paneCount > 1 && (
        <div className="px-6 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 shrink-0">
              <Scale className="w-3.5 h-3.5 text-[var(--lime-text)]" />
              <span>Comparison Panes:</span>
            </span>
            {activePanes.map((pane, idx) => (
              <div key={pane.id} className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] font-mono text-[var(--text-muted)]">#{idx + 1}:</span>
                <ModelMenu
                  models={models}
                  selectedModel={{ providerId: pane.providerId, modelId: pane.modelId }}
                  onSelectModel={(m) => onUpdatePaneModel(idx, m)}
                  onOpenProvidersModal={onOpenProvidersModal}
                  onToggleFavourite={onToggleFavourite}
                  variant={isLight ? "light" : "dark"}
                />
              </div>
            ))}
          </div>

          {/* Copy All Comparison Responses button */}
          <button
            type="button"
            onClick={copyAllComparison}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel-2)] hover:bg-[var(--hover-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
            title="Copy all pane responses to clipboard"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? "Copied All!" : "Copy All Responses"}</span>
          </button>
        </div>
      )}

      {/* Docked Composer Area */}
      <div className="px-4 md:px-8 pb-5 pt-2 shrink-0">
        <div className="max-w-4xl mx-auto w-full">
          <Composer
            value={prompt}
            onValueChange={onPromptChange}
            onSubmit={() => {
              scrollToBottom(false);
              onSubmit();
            }}
            isStreaming={isLoading}
            onCancel={onCancelStream}
            mode={mode}
            onModeChange={onModeChange}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onOpenProvidersModal={onOpenProvidersModal}
            paneCount={paneCount}
            temperature={temperature}
            onTemperatureChange={onTemperatureChange}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
