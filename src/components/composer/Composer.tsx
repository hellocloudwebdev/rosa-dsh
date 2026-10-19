import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Square, X, SlidersHorizontal, Plus, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import type { ModelWithProvider } from "@shared/types.js";
import { ModeMenu, type Mode } from "./ModeMenu";
import { ModelMenu } from "./ModelMenu";
import type { Theme } from "../Sidebar";

interface ComposerProps {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
  isStreaming?: boolean;
  onCancel?: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  models: ModelWithProvider[];
  selectedModel: { providerId: string; modelId: string } | null;
  onSelectModel: (m: { providerId: string; modelId: string; label?: string }) => void;
  onOpenProvidersModal: () => void;
  onToggleFavourite?: (providerId: string, modelId: string, current: boolean) => void;
  paneCount?: 1 | 2 | 3 | 4;
  temperature?: number;
  onTemperatureChange?: (t: number) => void;
  theme: Theme;
}

export function Composer({
  value,
  onValueChange,
  onSubmit,
  isStreaming = false,
  onCancel,
  mode,
  onModeChange,
  models,
  selectedModel,
  onSelectModel,
  onOpenProvidersModal,
  onToggleFavourite,
  paneCount = 1,
  temperature = 0.7,
  onTemperatureChange,
  theme,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [isPlusHovered, setIsPlusHovered] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  const isLight = theme === "light";
  const variant = isLight ? "light" : "dark";

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 200)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming && onCancel) {
        onCancel();
      } else if (value.trim()) {
        onSubmit();
      }
    }
  };

  const placeholderText =
    paneCount > 1
      ? `Prompt ${paneCount} models side-by-side (Enter to send)…`
      : mode === "Plan"
        ? "Plan architecture, breakdown tasks, or outline steps / @ for context"
        : mode === "Build"
          ? "Build code, generate components, or implement features / @ for context"
          : "Plan, Build, Automate / @ for context";

  return (
    <div className="w-full flex flex-col">
      {/* Main Composer Capsule */}
      <div
        className={`w-full rounded-[24px] p-3.5 border transition-all ${
          isLight
            ? "bg-white border-[#e4e4df] shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:border-[var(--lime)]/80 focus-within:shadow-[0_12px_36px_rgba(0,0,0,0.08)]"
            : "bg-[#1c1c1f] dark:bg-[#1f2023] border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.36)] focus-within:border-[var(--lime)]/70"
        }`}
      >
        {/* Attached file chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {files.map((f) => (
              <span
                key={f.name}
                className={`flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1 text-xs border ${
                  isLight
                    ? "bg-neutral-100 border-neutral-200 text-neutral-800"
                    : "bg-white/5 border-white/10 text-neutral-200"
                }`}
              >
                <span className="truncate max-w-[180px]">{f.name}</span>
                <span className="text-[10px] text-neutral-400">({Math.round(f.size / 1024)} KB)</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((x) => x.name !== f.name))}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-400 hover:text-[var(--text-primary)] cursor-pointer"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Main input */}
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          className={`w-full bg-transparent resize-none outline-none text-[15px] leading-6 px-1 transition-colors ${
            isLight
              ? "text-neutral-900 placeholder:text-neutral-400"
              : "text-neutral-100 placeholder:text-neutral-400"
          }`}
        />

        {/* Bottom Toolbar */}
        <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-nowrap">
          {/* Left Controls: Plus, Mode, Model, Temperature */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
            {/* Animated Expandable Plus / Add files button */}
            <motion.button
              layout
              type="button"
              onMouseEnter={() => setIsPlusHovered(true)}
              onMouseLeave={() => setIsPlusHovered(false)}
              onClick={() => fileRef.current?.click()}
              transition={{ type: "spring", stiffness: 450, damping: 30 }}
              className={`h-8 rounded-full border border-neutral-200/80 dark:border-white/10 bg-neutral-100/90 dark:bg-white/10 hover:bg-neutral-200/80 dark:hover:bg-white/15 flex items-center justify-center text-neutral-700 dark:text-neutral-200 transition-colors cursor-pointer shadow-2xs shrink-0 ${
                isPlusHovered ? "px-3 gap-1.5" : "w-8 px-0"
              }`}
              title="Attach file or code snippet"
              aria-label="Add files"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <AnimatePresence>
                {isPlusHovered && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs font-medium whitespace-nowrap overflow-hidden"
                  >
                    Add files
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const added = Array.from(e.target.files ?? []).map((f) => ({
                  name: f.name,
                  size: f.size,
                }));
                if (added.length) {
                  setFiles((prev) => [...prev, ...added.filter((n) => !prev.some((x) => x.name === n.name))]);
                }
                e.target.value = "";
              }}
            />

            {/* Mode menu (Plan, Ask, Build) */}
            <ModeMenu mode={mode} onChange={onModeChange} variant={variant} />

            {/* Model Menu */}
            {paneCount === 1 ? (
              <ModelMenu
                models={models}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                onOpenProvidersModal={onOpenProvidersModal}
                onToggleFavourite={onToggleFavourite}
                variant={variant}
              />
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] px-3 py-1 rounded-full bg-neutral-100 dark:bg-white/10 border border-neutral-200 dark:border-white/10 shrink-0">
                <span className="w-2 h-2 rounded-full bg-[var(--lime-badge)] animate-pulse" />
                <span>Comparing {paneCount} models</span>
              </div>
            )}

            {/* Temperature Settings Popover */}
            {onTemperatureChange && (
              <Popover.Root>
                <Popover.Trigger asChild>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    className="flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)] shrink-0"
                    title="Sampling Temperature & Settings"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden md:inline font-mono">{temperature.toFixed(1)}</span>
                  </motion.button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="center"
                    sideOffset={8}
                    className="w-64 rounded-2xl p-3.5 z-50 border shadow-2xl bg-white/95 dark:bg-[#1e1f23]/95 backdrop-blur-md border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-100 focus:outline-none"
                  >
                    <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                      <span>Creativity (Temperature)</span>
                      <span className="font-mono text-[#507d00] dark:text-[#c6f232] font-bold">{temperature.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => onTemperatureChange(Number.parseFloat(e.target.value))}
                      className="w-full accent-[var(--lime)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1.5 font-mono">
                      <span>0.0 (Code)</span>
                      <span>0.7 (Default)</span>
                      <span>1.5 (Creative)</span>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
          </div>

          {/* Right Controls: Mic + Send or Stop Button (pinned to right, never wraps) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Microphone / Voice button */}
            <button
              type="button"
              className="w-8 h-8 rounded-full border border-neutral-200/80 dark:border-white/10 bg-neutral-100/90 dark:bg-white/10 hover:bg-neutral-200/80 dark:hover:bg-white/15 flex items-center justify-center text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer shadow-2xs"
              title="Voice input"
              aria-label="Voice input"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send or Stop Button */}
            {isStreaming ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onSubmit}
                disabled={!value.trim()}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                  value.trim()
                    ? "bg-[#c6f232] text-black hover:opacity-90 font-semibold"
                    : isLight
                      ? "bg-neutral-100 text-neutral-400 cursor-not-allowed border border-neutral-200"
                      : "bg-white/10 text-neutral-500 cursor-not-allowed border border-white/5"
                }`}
                aria-label="Send prompt"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.4]" />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Pro Benefits Banner matching reference video */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className={`mt-2.5 px-4 py-2 rounded-2xl flex items-center justify-between text-xs border shadow-2xs ${
              isLight
                ? "border-emerald-600/20 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 text-neutral-800"
                : "border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-transparent text-neutral-200"
            }`}
          >
            <div className="flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200">
              <span className="font-medium">Upgrade to Pro.</span>
              <button
                type="button"
                onClick={onOpenProvidersModal}
                className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white underline cursor-pointer"
              >
                See Pro benefits
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenProvidersModal}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
              >
                Upgrade
              </button>
              <button
                type="button"
                onClick={() => setShowBanner(false)}
                className="w-5 h-5 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
