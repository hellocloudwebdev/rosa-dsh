import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import type { ModelWithProvider } from "@shared/types.js";
import { Composer } from "./composer/Composer";
import type { Mode } from "./composer/ModeMenu";
import type { Theme } from "./Sidebar";
import type { Msg, ChatPane } from "../types";
import { ModelIcon } from "./composer/icons";
import { MarkdownMessage } from "./MarkdownMessage";
import { ModelMenu } from "./composer/ModelMenu";

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

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, panes]);

  const copyText = (id: string | number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isLight = theme === "light";

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-[var(--bg-app)] transition-colors duration-300 relative overflow-hidden">
      {/* Scrollable conversation thread */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
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
                  {panes.slice(0, paneCount).map((pane, idx) => (
                    <div
                      key={pane.id}
                      className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-panel-2)] p-4 shadow-md flex flex-col justify-between"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--border-subtle)] text-xs">
                        <div className="flex items-center gap-2">
                          <ModelIcon type={pane.modelId} className="w-3.5 h-3.5" />
                          <span className="font-semibold text-[var(--text-primary)] truncate max-w-[140px]">
                            #{idx + 1} · {pane.modelLabel}
                          </span>
                        </div>
                        {pane.streaming ? (
                          <span className="text-[10px] text-[var(--lime-text)] animate-pulse flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--lime-text)]" />
                            Streaming…
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400 font-mono">Ready</span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-h-[120px] text-sm">
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

                      {/* Live metrics footer */}
                      {pane.metrics && (
                        <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                          <span>
                            {pane.metrics.tokensPerSecond
                              ? `${pane.metrics.tokensPerSecond.toFixed(1)} tok/s`
                              : "—"}
                          </span>
                          <span>
                            {pane.metrics.ttftMs ? `${pane.metrics.ttftMs}ms` : "—"}
                          </span>
                          <span>
                            {pane.metrics.outputTokens ? `${pane.metrics.outputTokens} tok` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
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

      {/* Pane Model Bar when in Multi-Pane Mode */}
      {paneCount > 1 && (
        <div className="px-6 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center gap-3 overflow-x-auto shrink-0">
          <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 shrink-0">
            <Scale className="w-3.5 h-3.5 text-[var(--lime-text)]" />
            <span>Comparison Panes:</span>
          </span>
          {panes.slice(0, paneCount).map((pane, idx) => (
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
      )}

      {/* Docked Composer Area */}
      <div className="px-4 md:px-8 pb-5 pt-2 shrink-0">
        <div className="max-w-4xl mx-auto w-full">
          <Composer
            value={prompt}
            onValueChange={onPromptChange}
            onSubmit={onSubmit}
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
