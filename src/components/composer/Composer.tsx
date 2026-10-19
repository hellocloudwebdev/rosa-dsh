import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Mic, Plus, X, SlidersHorizontal, Square } from "lucide-react";
import { motion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import type { ModelWithProvider } from "@shared/types.js";
import { HoverExpand } from "./HoverExpand";
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
  const [files, setFiles] = useState<string[]>([]);

  const isLight = theme === "light";
  const variant = isLight ? "light" : "dark";

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
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
    <motion.div
      layout
      className={
        isLight
          ? "w-full bg-white rounded-[22px] px-4 pt-4 pb-3 border border-[#e8e8e4] shadow-[0_10px_34px_-10px_rgba(0,0,0,0.12)] transition-colors"
          : "w-full bg-[#1c221d] rounded-[22px] px-4 pt-4 pb-3 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)] border border-white/5 transition-colors"
      }
    >
      {/* Attached file chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f) => (
            <span
              key={f}
              className={`flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1 text-xs transition-colors ${
                isLight
                  ? "bg-neutral-100 border border-neutral-200/70 text-neutral-700"
                  : "bg-[#2c352e] text-neutral-300 border border-white/5"
              }`}
            >
              <span className="truncate max-w-[180px]">{f}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((x) => x !== f))}
                className={`w-4 h-4 rounded-full flex items-center justify-center cursor-pointer ${
                  isLight
                    ? "hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700"
                    : "hover:bg-white/10 text-neutral-400 hover:text-white"
                }`}
                aria-label={`Remove ${f}`}
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
            : "text-neutral-100 placeholder:text-[#93949a]"
        }`}
      />

      {/* Toolbar */}
      <div className="mt-2.5 flex items-center justify-between gap-2 flex-nowrap">
        {/* Left controls: Add files, Mode, Model, Temperature */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
          <HoverExpand
            icon={<Plus className="w-4 h-4" />}
            label="Add files"
            ariaLabel="Add files"
            onClick={() => fileRef.current?.click()}
            variant={variant}
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const names = Array.from(e.target.files ?? []).map((f) => f.name);
              if (names.length) {
                setFiles((prev) => [...prev, ...names.filter((n) => !prev.includes(n))]);
              }
              e.target.value = "";
            }}
          />

          <ModeMenu mode={mode} onChange={onModeChange} variant={variant} />

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
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  className={`flex items-center gap-1.5 h-8.5 px-3 rounded-full text-xs font-semibold cursor-pointer outline-none transition-colors border shrink-0 ${
                    isLight
                      ? "bg-[#f2f2f0] hover:bg-[#e7e7e4] text-neutral-800 border-neutral-200/70"
                      : "bg-[#242b25] hover:bg-[#2e372f] text-neutral-100 border-white/5"
                  }`}
                  title="Sampling Temperature & Settings"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="font-mono">{temperature.toFixed(1)}</span>
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

        {/* Right controls: Mic + Send or Stop */}
        <div className="flex items-center gap-2 shrink-0">
          <HoverExpand
            icon={<Mic className="w-4 h-4" />}
            label="Record"
            ariaLabel="Record voice"
            variant={variant}
          />

          {isStreaming ? (
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 h-8.5 px-3.5 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Stop generation"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </motion.button>
          ) : (
            <motion.button
              layout
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onSubmit}
              disabled={!value.trim()}
              className={`w-8.5 h-8.5 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                isLight
                  ? value.trim()
                    ? "bg-[#18181b] text-white hover:bg-neutral-800"
                    : "bg-[#f2f2f0] text-neutral-400 border border-neutral-200/70"
                  : value.trim()
                    ? "bg-white text-neutral-900 hover:bg-neutral-200"
                    : "bg-[#242b25] text-neutral-500 border border-white/5"
              }`}
              aria-label="Send"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
