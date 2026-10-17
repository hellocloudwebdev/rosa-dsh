import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Mic, Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import { HoverExpand } from "./HoverExpand";
import { ModeMenu, type Mode } from "./ModeMenu";
import { ModelMenu, type ModelSel } from "./ModelMenu";
import type { Theme } from "../Sidebar";

interface ComposerProps {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  model: ModelSel;
  onModelChange: (m: ModelSel) => void;
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  theme: Theme;
}

export function Composer({
  value,
  onValueChange,
  onSubmit,
  mode,
  onModeChange,
  model,
  onModelChange,
  auto,
  onAutoChange,
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
      if (value.trim()) onSubmit();
    }
  };

  return (
    <motion.div
      layout
      className={
        isLight
          ? "w-full bg-white rounded-[22px] px-3.5 pt-3.5 pb-2.5 border border-[#e8e8e4] shadow-[0_10px_34px_-10px_rgba(0,0,0,0.12)]"
          : "w-full bg-[#1c221d] rounded-[22px] px-3.5 pt-3.5 pb-2.5 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.6)]"
      }
    >
      {/* Attached file chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f) => (
            <span
              key={f}
              className={`flex items-center gap-1.5 rounded-md pl-2 pr-1 py-1 text-xs transition-colors ${
                isLight
                  ? "bg-neutral-100 border border-neutral-200/70 text-neutral-700"
                  : "bg-[#2c352e] text-neutral-300"
              }`}
            >
              {f}
              <button
                onClick={() => setFiles(files.filter((x) => x !== f))}
                className={`w-4 h-4 rounded flex items-center justify-center cursor-pointer ${
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

      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Plan, Build, Automate / @ for context"
        className={`w-full bg-transparent resize-none outline-none text-[15px] leading-6 px-1 transition-colors ${
          isLight
            ? "text-neutral-900 placeholder:text-neutral-400"
            : "text-neutral-100 placeholder:text-[#93949a]"
        }`}
      />

      {/* Toolbar */}
      <div className="mt-2 flex items-center gap-1.5">
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
        <ModelMenu
          model={model}
          onModelChange={onModelChange}
          auto={auto}
          onAutoChange={onAutoChange}
          variant={variant}
        />

        <div className="flex-1" />

        <HoverExpand
          icon={<Mic className="w-4 h-4" />}
          label="Record"
          ariaLabel="Record voice"
          variant={variant}
        />

        <motion.button
          layout
          onClick={onSubmit}
          disabled={!value.trim()}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            isLight
              ? value.trim()
                ? "bg-neutral-900 text-white hover:bg-neutral-700"
                : "bg-[#f2f2f0] text-neutral-300"
              : value.trim()
                ? "bg-white text-neutral-900 hover:bg-neutral-200"
                : "bg-[#2e372f] text-neutral-500"
          }`}
          aria-label="Send"
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
        </motion.button>
      </div>
    </motion.div>
  );
}
