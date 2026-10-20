import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Mic, Plus, Square, SlidersHorizontal, X } from "lucide-react";
import type { ModelWithProvider } from "@shared/types.js";
import "./composer.css";
import { ModeMenu, type Mode } from "./ModeMenu";
import { ModelMenu, type ModelSelection } from "./ModelMenu";
import type { EffortLevel } from "./effort";

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
  onSelectModel: (m: ModelSelection) => void;
  onOpenProvidersModal: () => void;
  onToggleFavourite?: (providerId: string, modelId: string, current: boolean) => void;
  efforts: Record<string, EffortLevel>;
  onSelectEffort: (providerId: string, modelId: string, effort: EffortLevel) => void;
  autoRouting: boolean;
  onAutoRoutingChange: (enabled: boolean) => void;
  paneCount?: 1 | 2 | 3 | 4;
  temperature?: number;
  onTemperatureChange?: (t: number) => void;
  theme: "dark" | "light";
}

const CONTEXT_OPTIONS = [
  { tag: "@codebase", category: "Workspace" },
  { tag: "@docs", category: "References" },
  { tag: "@terminal", category: "Last output" },
];

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Chat composer: prompt card, attachment chips, mode / model / effort controls,
 * @-context insertion, temperature and the send / stop action.
 */
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
  efforts,
  onSelectEffort,
  autoRouting,
  onAutoRoutingChange,
  paneCount = 1,
  temperature = 0.7,
  onTemperatureChange,
  theme,
}: ComposerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<string[]>([]);
  const [modeOpen, setModeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [tempOpen, setTempOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const isRecording = recordingStartedAt !== null;

  // Auto-grow the prompt box up to four lines.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  // Recording timer.
  useEffect(() => {
    if (recordingStartedAt === null) return;
    const interval = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [recordingStartedAt]);

  const closeAllMenus = () => {
    setModeOpen(false);
    setModelOpen(false);
    setTempOpen(false);
  };

  // Outside click / Escape dismiss every composer popover.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAllMenus();
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeAllMenus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // `@` context trigger: the last token of the prompt.
  const atMatch = isFocused ? /@([\w-]*)$/.exec(value) : null;
  const atQuery = atMatch ? atMatch[1] : "";
  const visibleContextOptions = atMatch
    ? CONTEXT_OPTIONS.filter((o) => o.tag.slice(1).startsWith(atQuery.toLowerCase()))
    : [];

  const insertContextTag = (tag: string) => {
    if (!atMatch) {
      onValueChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${tag} `);
      return;
    }
    const base = value.slice(0, value.length - atMatch[0].length);
    onValueChange(`${base}${tag} `);
    taRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming && onCancel) onCancel();
      else if (value.trim()) onSubmit();
    }
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).map((f) => f.name);
    if (picked.length) setFiles((prev) => Array.from(new Set([...prev, ...picked])));
    e.target.value = "";
  };

  const toggleRecording = () => {
    if (isRecording) {
      setRecordingStartedAt(null);
      setRecordingSeconds(0);
      return;
    }
    setRecordingSeconds(0);
    setRecordingStartedAt(Date.now());
  };

  const placeholderText =
    paneCount > 1
      ? `Prompt ${paneCount} models side-by-side / @ for context`
      : "Plan, Build, Automate / @ for context";

  const canSend = value.trim().length > 0;

  return (
    <div ref={rootRef} className="rosa-chat-theme w-full select-none" data-theme={theme}>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFiles}
        aria-hidden="true"
        tabIndex={-1}
      />

      <section className="composer-card">
        {/* Attachment chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {files.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-[12.5px] border"
                style={{
                  background: "var(--chip-bg)",
                  borderColor: "var(--chip-border)",
                  color: "var(--text-secondary)",
                }}
              >
                <span className="truncate max-w-[180px]">{name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((f) => f !== name))}
                  className="w-4.5 h-4.5 rounded-full flex items-center justify-center hover:opacity-70 transition-opacity"
                  aria-label={`Remove ${name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Prompt + @ context menu */}
        <div className="relative">
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsFocused(true);
              closeAllMenus();
            }}
            onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
            placeholder={placeholderText}
            className="prompt-input"
            aria-label="Prompt"
          />

          <div
            className={`glass-popover ${atMatch ? "popover-visible" : "popover-hidden"} absolute left-0 bottom-[calc(100%+8px)] w-[248px] rounded-[18px] p-1.5 z-30`}
          >
            <div
              className="px-2.5 py-1.5 text-[12px] font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              Add context
            </div>
            {visibleContextOptions.length === 0 ? (
              <div
                className="px-2.5 pb-2 text-[13.5px]"
                style={{ color: "var(--text-secondary)" }}
              >
                No matching context
              </div>
            ) : (
              visibleContextOptions.map((option) => (
                <button
                  key={option.tag}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertContextTag(option.tag)}
                  className="w-full flex items-center justify-between px-2.5 h-8.5 rounded-[10px] mode-menu-item"
                >
                  <span>{option.tag}</span>
                  <span className="text-[12.5px] font-normal" style={{ color: "var(--text-secondary)" }}>
                    {option.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Add files */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pill-control add-files-btn"
              title="Add files"
            >
              <Plus
                className="w-4 h-4 shrink-0"
                strokeWidth={1.9}
                style={{ color: "var(--icon-primary)" }}
              />
              <span className="add-files-label" style={{ color: "var(--text-primary)" }}>
                Add files
              </span>
            </button>

            <ModeMenu
              mode={mode}
              onChange={onModeChange}
              open={modeOpen}
              onOpenChange={(next) => {
                setModelOpen(false);
                setTempOpen(false);
                setModeOpen(next);
              }}
            />

            {paneCount > 1 ? (
              <span
                className="pill-control px-3.5 text-[15px] font-medium tracking-[-0.011em] whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                Comparing {paneCount} models
              </span>
            ) : (
              <ModelMenu
                models={models}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                onOpenProvidersModal={onOpenProvidersModal}
                onToggleFavourite={onToggleFavourite}
                efforts={efforts}
                onSelectEffort={onSelectEffort}
                auto={autoRouting}
                onAutoChange={onAutoRoutingChange}
                open={modelOpen}
                onOpenChange={(next) => {
                  setModeOpen(false);
                  setTempOpen(false);
                  setModelOpen(next);
                }}
                theme={theme}
              />
            )}

            {/* Temperature */}
            {onTemperatureChange && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setModeOpen(false);
                    setModelOpen(false);
                    setTempOpen(!tempOpen);
                  }}
                  className="pill-control px-3 gap-1.5"
                  title="Temperature"
                  aria-label={`Temperature ${temperature.toFixed(1)}`}
                  aria-expanded={tempOpen}
                >
                  <SlidersHorizontal
                    className="w-3.5 h-3.5"
                    strokeWidth={1.9}
                    style={{ color: "var(--icon-primary)" }}
                  />
                  <span className="text-[14px] font-medium tabular-nums">
                    {temperature.toFixed(1)}
                  </span>
                </button>

                <div
                  className={`glass-popover ${tempOpen ? "popover-visible" : "popover-hidden"} absolute left-0 bottom-0 w-[220px] rounded-[18px] p-3 z-30`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[14px] font-medium tracking-[-0.011em]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Temperature
                    </span>
                    <span
                      className="text-[13px] tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {temperature.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => onTemperatureChange(Number(e.target.value))}
                    className="w-full accent-current cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                    aria-label="Temperature value"
                  />
                  <div
                    className="flex justify-between text-[11.5px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Record */}
            <button
              type="button"
              onClick={toggleRecording}
              className={`pill-control record-btn ${isRecording ? "recording" : ""}`}
              title={isRecording ? "Stop recording" : "Record voice"}
              aria-label={isRecording ? "Stop recording" : "Record voice"}
              aria-pressed={isRecording}
            >
              {isRecording ? (
                <span
                  className="recording-dot w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: "currentColor" }}
                />
              ) : (
                <Mic
                  className="w-4 h-4 shrink-0"
                  strokeWidth={1.9}
                  style={{ color: "var(--icon-primary)" }}
                />
              )}
              <span
                className="record-label tabular-nums"
                style={isRecording ? undefined : { color: "var(--text-primary)" }}
              >
                {isRecording ? formatDuration(recordingSeconds) : "Record"}
              </span>
            </button>

            {isStreaming && onCancel ? (
              <button type="button" onClick={onCancel} className="stop-btn" aria-label="Stop generating">
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                className={`submit-btn ${canSend ? "ready" : ""}`}
                aria-label="Send"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.1} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
