import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AcmeLogo } from "./icons/AcmeLogo";
import { Composer } from "./composer/Composer";
import type { Mode } from "./composer/ModeMenu";
import type { ModelSel } from "./composer/ModelMenu";
import { UpgradeBanner } from "./composer/UpgradeBanner";
import { SuggestedList } from "./SuggestedList";
import type { Theme } from "./Sidebar";
import type { Msg } from "../types";

interface PrimaryWorkspaceProps {
  messages: Msg[];
  isLoading: boolean;
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  model: ModelSel;
  onModelChange: (m: ModelSel) => void;
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  banner: boolean;
  onDismissBanner: () => void;
  onSelectSuggestion: (p: string) => void;
  theme: Theme;
}

/**
 * UnifiedAIWorkspace — the single primary area where all AI interaction
 * happens (conversation, generation, agent/tool activity). There is no
 * separate chat or code pane; contextual visual output lives in the
 * conditional View panel instead.
 */
export function PrimaryWorkspace({
  messages,
  isLoading,
  prompt,
  onPromptChange,
  onSubmit,
  mode,
  onModeChange,
  model,
  onModelChange,
  auto,
  onAutoChange,
  banner,
  onDismissBanner,
  onSelectSuggestion,
  theme,
}: PrimaryWorkspaceProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-[var(--bg-app)] transition-colors duration-300">
      <div className="m-auto w-full max-w-[640px] px-6 py-14 flex flex-col">
        {/* Conversation / agent activity transcript */}
        {(messages.length > 0 || isLoading) && (
          <div ref={listRef} className="mb-7 space-y-3 max-h-[36vh] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-2.5"
                >
                  {m.role === "assistant" && (
                    <AcmeLogo className="w-4 h-4 mt-1 text-[var(--lime-text)] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === "user"
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                      }`}
                    >
                      {m.text}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{m.meta}</p>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)] pl-[26px]"
                >
                  <Sparkles className="w-4 h-4 text-[var(--lime-text)] animate-spin" />
                  <span>Ace is drafting your email…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Hero */}
        <div className="mb-6">
          <div className="mb-5">
            <AcmeLogo className="w-8 h-8 text-[var(--text-primary)]" />
          </div>
          <h1 className="text-[30px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] leading-tight transition-colors">
            Create Emails Worth Opening
          </h1>
        </div>

        {/* Composer */}
        <Composer
          value={prompt}
          onValueChange={onPromptChange}
          onSubmit={onSubmit}
          mode={mode}
          onModeChange={onModeChange}
          model={model}
          onModelChange={onModelChange}
          auto={auto}
          onAutoChange={onAutoChange}
          theme={theme}
        />

        {/* Upgrade banner */}
        <AnimatePresence>
          {banner && <UpgradeBanner onDismiss={onDismissBanner} />}
        </AnimatePresence>

        {/* Suggestions */}
        <SuggestedList onSelectPrompt={onSelectSuggestion} />
      </div>
    </div>
  );
}
