import { useEffect, useRef, useState } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.js";
import { SendIcon, StopIcon, SettingsIcon, MetricsIcon, CompareIcon } from "../ui/Icons.js";

export interface ComposerProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onSend: (conversationId: string, text: string) => void | Promise<void>;
  streaming: boolean;
}

const MAX_CHARS = 32_000;

/**
 * The message composer.
 *
 * Enter sends, Shift+Enter inserts a newline, so the textarea grows with
 * long prompts instead of scrolling horizontally.
 */
export function Composer({ state, dispatch, onSend, streaming }: ComposerProps) {
  const [value, setValue] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to a cap, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    if (text.length > MAX_CHARS) return;
    setValue("");
    void onSend(state.activeConversationId ?? "", text);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      // Let the newline through; the textarea handles it.
      return;
    }
  };

  const chars = value.length;
  const overLimit = chars > MAX_CHARS;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <div
        className={cn(
          "rounded-xl border bg-surface-raised transition-colors",
          "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
          overLimit ? "border-state-danger" : "border-line-subtle",
        )}
      >
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={streaming}
          placeholder={
            state.mode === "compare"
              ? "Ask every selected model the same question…"
              : "Send a message…"
          }
          aria-describedby="composer-hint"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-relaxed",
            "text-ink-strong placeholder:text-ink-faint focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-70",
          )}
        />

        <div className="flex items-center gap-1.5 border-t border-line-subtle px-2.5 py-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            aria-controls="advanced-controls"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors",
              showAdvanced
                ? "bg-surface-sunken text-ink-strong"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink-strong",
            )}
          >
            <SettingsIcon size={13} />
            Parameters
          </button>

          {state.mode === "compare" ? (
            <span className="hidden items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-[11px] text-ink-muted sm:inline-flex">
              <CompareIcon size={12} />
              {state.panes.length} models
            </span>
          ) : null}

          <span
            className={cn(
              "ml-auto tabular-nums text-[11px]",
              overLimit ? "text-state-danger-strong" : "text-ink-faint",
            )}
          >
            {chars > 0 ? `${chars.toLocaleString()}/${MAX_CHARS.toLocaleString()}` : ""}
          </span>

          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={streaming || !value.trim() || overLimit}
          >
            <SendIcon size={14} />
            Send
          </Button>

          {streaming ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
              streaming
            </span>
          ) : null}
        </div>
      </div>

      {showAdvanced ? (
        <div
          id="advanced-controls"
          className="rounded-xl border border-line-subtle bg-surface-raised p-3"
        >
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="system-prompt" className="text-[12px] font-medium text-ink-strong">
                System prompt
              </label>
              <textarea
                id="system-prompt"
                rows={2}
                value={state.systemPrompt}
                onChange={(e) => dispatch({ type: "prompt/system", value: e.target.value })}
                placeholder="Optional instructions applied to every model in this conversation."
                className="w-full resize-none rounded-md border border-line-subtle bg-surface px-2.5 py-2 text-[13px] text-ink-strong placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="temperature" className="flex items-center justify-between text-[12px] font-medium text-ink-strong">
                  Temperature
                  <span className="tabular-nums text-ink-muted">{state.temperature.toFixed(2)}</span>
                </label>
                <input
                  id="temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={state.temperature}
                  onChange={(e) => dispatch({ type: "prompt/temperature", value: Number(e.target.value) })}
                  className="accent-brand-600"
                />
                <p className="text-[11px] text-ink-faint">
                  Applied to every request. Providers that ignore it will simply
                  not honour it.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="max-tokens" className="text-[12px] font-medium text-ink-strong">
                  Max output tokens
                </label>
                <input
                  id="max-tokens"
                  type="number"
                  min={1}
                  max={200_000}
                  placeholder="Provider default"
                  value={state.maxTokens ?? ""}
                  onChange={(e) =>
                    dispatch({
                      type: "prompt/maxTokens",
                      value: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-9 w-full rounded-md border border-line-subtle bg-surface px-2.5 text-[13px] text-ink-strong focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                />
                <p className="text-[11px] text-ink-faint">
                  Leave blank to let the model decide.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <p id="composer-hint" className="px-1 text-[11px] text-ink-faint">
        Enter sends · Shift+Enter adds a line · each pane streams independently,
        so one slow model never blocks the others.
      </p>
    </div>
  );
}

void (StopIcon as unknown);
void (MetricsIcon as unknown);
