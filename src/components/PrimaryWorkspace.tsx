import { useEffect, useRef, useState, useMemo } from "react";
import {
  Zap,
  Clock,
  BarChart2,
  Copy,
  Check,
  Scale,
  ArrowDown,
  Key,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import type { ModelWithProvider } from "@shared/types.js";
import { Composer } from "./composer/Composer";
import type { Mode } from "./composer/ModeMenu";
import type { Theme } from "./Sidebar";
import type { Msg, ChatPane } from "../types";
import { AcmeLogo } from "./icons/AcmeLogo";
import { UpgradeBanner } from "./composer/UpgradeBanner";
import { SuggestedList } from "./SuggestedList";
import { MarkdownMessage } from "./MarkdownMessage";
import { ModelMenu } from "./composer/ModelMenu";
import { ComparisonPane } from "./ComparisonPane";
import {
  readAutoRouting,
  readEfforts,
  writeAutoRouting,
  writeEfforts,
  type EffortLevel,
} from "./composer/effort";

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
  const [banner, setBanner] = useState(true);

  // Composer model preferences, shared by the prompt card and the pane bar.
  const [efforts, setEfforts] = useState<Record<string, EffortLevel>>(readEfforts);
  const [autoRouting, setAutoRouting] = useState(readAutoRouting);
  const [openPaneMenu, setOpenPaneMenu] = useState<number | null>(null);

  const handleSelectEffort = (providerId: string, modelId: string, effort: EffortLevel) => {
    setEfforts((prev) => {
      const next = { ...prev, [`${providerId}:${modelId}`]: effort };
      writeEfforts(next);
      return next;
    });
  };

  const handleAutoRoutingChange = (enabled: boolean) => {
    writeAutoRouting(enabled);
    setAutoRouting(enabled);
  };

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
    <div
      onScroll={handleScroll}
      className="flex-1 min-w-0 h-full overflow-y-auto flex flex-col bg-[var(--bg-app)] transition-colors duration-300 relative"
    >
      {/* Centered content block: width min(100% - 32px, 760px), min 48px top/bottom gap,
          vertically centered (~45–50% viewport); auto margins degrade to scroll when tall */}
      <div className="m-auto w-[min(100%_-_32px,_760px)] py-10 flex flex-col">
        {/* Conversation transcript when messages exist */}
        {messages.length > 0 && (
          <div ref={listRef} className="mb-7 space-y-4 w-full">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-white dark:bg-white/10 border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                      <AcmeLogo className="w-4 h-4 text-[var(--text-primary)]" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 transition-all ${
                      isUser
                        ? "bg-[#c6f232] text-neutral-900 font-medium shadow-xs"
                        : "bg-[var(--bg-panel-2)] border border-[var(--border-strong)] text-[var(--text-primary)] shadow-xs"
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
          </div>
        )}

        {/* Multi-Pane Live Comparison View when streaming in multi-pane mode */}
        {isLoading && paneCount > 1 && (
          <div
            className={`grid gap-4 mb-6 w-full ${
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
        )}

        {/* Single pane live stream when streaming single model */}
        {isLoading && paneCount === 1 && (
          <div className="flex gap-3 justify-start mb-6 w-full">
            <div className="w-7 h-7 rounded-xl bg-white dark:bg-white/10 border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
              <AcmeLogo className="w-4 h-4 text-[var(--lime-badge)] animate-spin" />
            </div>
            <div className="max-w-[85%] rounded-2xl p-4 bg-[var(--bg-panel-2)] border border-[var(--border-strong)] text-[var(--text-primary)] shadow-sm">
              {panes[0]?.streamingContent ? (
                <>
                  <MarkdownMessage content={panes[0].streamingContent} />
                  <span className="inline-block w-1.5 h-4 ml-1 bg-[#c6f232] animate-pulse align-middle" />
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="w-2 h-2 rounded-full bg-[#c6f232] animate-ping" />
                  <span>Connecting to model provider…</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hero when no conversation */}
        {messages.length === 0 && !isLoading && (
          <div className="mb-6 text-left w-full">
            <div className="mb-4">
              <AcmeLogo className="w-8 h-8 text-[var(--text-primary)]" />
            </div>
            <h1 className="text-[30px] sm:text-[34px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] leading-tight transition-colors">
              Create Emails Worth Opening
            </h1>
          </div>
        )}

        {/* Direct CTA when no models configured */}
        {models.length === 0 && (
          <div
            data-testid="no-models-cta-card"
            className="w-full mb-6 flex flex-col items-center justify-center p-6 rounded-2xl border border-[var(--border-strong)] bg-white dark:bg-[#1c221d] shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-[#c6f232] text-black flex items-center justify-center mb-3">
              <Key className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
              No models configured
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-4 text-center">
              Connect an API provider or enter a key to start chatting and comparing models.
            </p>
            <button
              type="button"
              onClick={onOpenProvidersModal}
              data-testid="configure-provider-cta"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#c6f232] text-black hover:opacity-90 flex items-center gap-2 shadow-xs transition-all cursor-pointer font-medium"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configure Provider & API Key</span>
            </button>
          </div>
        )}

        {/* Single Center Composer */}
        <div className="w-full">
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
            onToggleFavourite={onToggleFavourite}
            efforts={efforts}
            onSelectEffort={handleSelectEffort}
            autoRouting={autoRouting}
            onAutoRoutingChange={handleAutoRoutingChange}
            paneCount={paneCount}
            temperature={temperature}
            onTemperatureChange={onTemperatureChange}
            theme={theme}
          />
        </div>

        {/* Upgrade Banner matching video */}
        <AnimatePresence>
          {banner && (
            <UpgradeBanner
              onDismiss={() => setBanner(false)}
              onUpgrade={onOpenProvidersModal}
              theme={isLight ? "light" : "dark"}
            />
          )}
        </AnimatePresence>

        {/* Suggestions when empty */}
        {messages.length === 0 && !isLoading && (
          <SuggestedList onSelectPrompt={(p) => onPromptChange(p)} />
        )}
      </div>

      {/* Floating Jump to Bottom Button */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#202721] border border-neutral-300 dark:border-white/15 text-neutral-800 dark:text-neutral-100 text-xs font-semibold shadow-lg hover:border-[var(--lime)] transition-all cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5 text-[var(--lime-badge)]" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Pane Model Bar when in Multi-Pane Mode. Popovers open upward out of the
          bar, so this row wraps instead of clipping them behind an overflow
          container. */}
      {paneCount > 1 && (
        <div className="px-6 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between gap-3 flex-wrap shrink-0 mt-auto">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 shrink-0">
              <Scale className="w-3.5 h-3.5 text-[var(--lime-badge)]" />
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
                  efforts={efforts}
                  onSelectEffort={handleSelectEffort}
                  auto={false}
                  onAutoChange={() => undefined}
                  open={openPaneMenu === idx}
                  onOpenChange={(next) => setOpenPaneMenu(next ? idx : null)}
                  theme={isLight ? "light" : "dark"}
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
    </div>
  );
}
