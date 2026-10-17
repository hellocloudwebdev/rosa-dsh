import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Paperclip, Square, X, SlidersHorizontal } from "lucide-react";
import { motion } from "framer-motion";
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
  paneCount = 1,
  temperature = 0.7,
  onTemperatureChange,
  theme,
}: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);

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

  return (
    <div
      className={`w-full rounded-2xl p-3 border transition-all ${
        isLight
          ? "bg-white border-neutral-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] focus-within:border-[var(--lime)]/80"
          : "bg-[var(--bg-panel-2)] border-[var(--border-strong)] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)] focus-within:border-[var(--lime)]/70"
      }`}
    >
      {/* Attached file chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 px-1">
          {files.map((f) => (
            <span
              key={f.name}
              className={`flex items-center gap-1.5 rounded-lg pl-2.5 pr-1.5 py-1 text-xs border ${
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
                className="w-4 h-4 rounded flex items-center justify-center text-neutral-400 hover:text-[var(--text-primary)] cursor-pointer"
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
        placeholder={
          paneCount > 1
            ? `Prompt ${paneCount} models side-by-side (Enter to send, Shift+Enter for new line)…`
            : "Ask anything, compare models, or write code (Enter to send)…"
        }
        className={`w-full bg-transparent resize-none outline-none text-sm leading-6 px-1 transition-colors ${
          isLight
            ? "text-neutral-900 placeholder:text-neutral-400"
            : "text-neutral-100 placeholder:text-neutral-500"
        }`}
      />

      {/* Toolbar */}
      <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
        {/* Attach files */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer"
          title="Attach file or code snippet"
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Attach</span>
        </button>
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

        {/* Mode menu */}
        <ModeMenu mode={mode} onChange={onModeChange} variant={variant} />

        {/* Model Menu (For single pane mode or active master) */}
        {paneCount === 1 ? (
          <ModelMenu
            models={models}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            onOpenProvidersModal={onOpenProvidersModal}
            variant={variant}
          />
        ) : (
          <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] px-2 py-1 rounded-lg bg-[var(--hover-overlay)] border border-[var(--border-subtle)]">
            <span className="w-2 h-2 rounded-full bg-[var(--lime-text)] animate-pulse" />
            <span>Comparing {paneCount} models</span>
          </div>
        )}

        {/* Temperature Settings Popover */}
        {onTemperatureChange && (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer border border-transparent hover:border-[var(--border-subtle)]"
                title="Sampling Temperature & Settings"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{temperature.toFixed(1)}</span>
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="center"
                sideOffset={8}
                className="w-64 rounded-xl p-3 z-50 border shadow-2xl bg-[var(--bg-panel)] border-[var(--border-strong)] text-[var(--text-primary)] focus:outline-none"
              >
                <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                  <span>Temperature (Creativity)</span>
                  <span className="font-mono text-[var(--lime-text)]">{temperature.toFixed(2)}</span>
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
                  <span>0.0 (Precise / Code)</span>
                  <span>0.7 (Default)</span>
                  <span>1.5 (Creative)</span>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}

        <div className="flex-1" />

        {/* Send or Stop Button */}
        {isStreaming ? (
          <motion.button
            layout
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
            title="Stop generation"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </motion.button>
        ) : (
          <motion.button
            layout
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              value.trim()
                ? "bg-[var(--lime)] text-white hover:opacity-90 shadow-md"
                : isLight
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-white/5 text-neutral-500 cursor-not-allowed"
            }`}
            aria-label="Send prompt"
          >
            <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
