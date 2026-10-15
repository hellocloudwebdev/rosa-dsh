import { useState } from "react";
import type { ApiErrorPayload } from "../../../shared/types.js";
import type { ChatMessageView, PaneMetrics, PaneStatus } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { Markdown } from "./Markdown.js";
import { MetricsRow } from "./MetricsRow.js";
import { RefreshIcon, CopyIcon, CheckIcon, WarningIcon, StopIcon } from "../ui/Icons.js";

export interface MessageBubbleProps {
  message: ChatMessageView;
  isLast: boolean;
  /** Live pane state overrides the persisted message. */
  paneStatus?: PaneStatus;
  paneError?: ApiErrorPayload | null;
  paneMetrics?: PaneMetrics | null;
  onRegenerate?: () => void;
}

export function MessageBubble({
  message,
  paneStatus,
  paneError,
  paneMetrics,
  onRegenerate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  // Persisted messages carry their own status; a live pane overrides it.
  const status: PaneStatus = paneStatus ?? message.status ?? "completed";
  const streaming = status === "streaming";
  const failed = status === "failed";
  const cancelled = status === "cancelled";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  if (isUser) {
    return (
      <article className="flex justify-end" aria-label="Your message">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-[14px] leading-relaxed text-white sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-2" aria-label="Assistant response">
      {/* Header: which model produced this */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint">
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2l1.7 4.6L16.3 8.3l-4.6 1.7L10 14.6 8.3 10 3.7 8.3l4.6-1.7L10 2z" />
          </svg>
        </span>
        <span className="truncate text-[12px] font-medium text-ink-strong">
          {message.modelLabel ?? message.modelId ?? "Assistant"}
        </span>
        {cancelled ? (
          <span className="shrink-0 rounded-full border border-line-subtle px-1.5 py-px text-[10px] text-ink-muted">
            stopped
          </span>
        ) : null}
      </div>

      {/* Body */}
      {message.content ? (
        <div className="rounded-2xl rounded-tl-md border border-line-subtle bg-surface-raised px-3.5 py-2.5">
          <Markdown content={message.content} streaming={streaming} />
        </div>
      ) : streaming ? (
        <TypingPlaceholder />
      ) : null}

      {/* Failure is explicit, never a silent empty bubble. */}
      {failed ? (
        <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-bg px-3 py-2">
          <span className="mt-px shrink-0 text-state-danger-strong">
            <WarningIcon size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-state-danger-strong">
              {paneError?.code === "upstream-timeout"
                ? "The model did not respond in time."
                : "This model failed."}
            </p>
            <p className="mt-0.5 break-words text-[12px] leading-snug text-state-danger-strong/90">
              {paneError?.message ?? "The upstream provider returned an error."}
            </p>
            {paneError?.retryable ? (
              <p className="mt-1 text-[11px] text-ink-muted">
                This looks temporary — sending again is reasonable.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Metrics, then actions */}
      {paneMetrics || message.content ? (
        <MetricsRow
          metrics={paneMetrics ?? null}
          contextWindow={paneMetrics?.contextWindow ?? null}
          compact
        />
      ) : null}

      {!streaming && (message.content || failed) ? (
        <div className="flex items-center gap-1">
          <ActionChip
            label={copied ? "Copied" : "Copy"}
            onClick={() => void copy()}
            icon={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          />
          {onRegenerate ? (
            <ActionChip label="Regenerate" onClick={onRegenerate} icon={<RefreshIcon size={12} />} />
          ) : null}
          {failed ? (
            <ActionChip
              label="Stop retrying"
              onClick={() => window.scrollTo({ top: 0 })}
              icon={<StopIcon size={12} />}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ActionChip({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-line-subtle px-2 text-[11px]",
        "text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TypingPlaceholder() {
  return (
    <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-line-subtle bg-surface-raised px-3.5 py-3">
      <span className="flex gap-1" aria-label="Waiting for the first token">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
      <span className="text-[12px] text-ink-faint">Waiting for the first token…</span>
    </div>
  );
}
