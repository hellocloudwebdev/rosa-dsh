import { useMemo, useState } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../ui/Button.js";
import { DropdownMenu, type MenuItem } from "../ui/DropdownMenu.js";
import { Markdown } from "./Markdown.js";
import { MetricsRow } from "./MetricsRow.js";
import {
  StarIcon,
  StopIcon,
  WarningIcon,
  CopyIcon,
  CheckIcon,
  ChevronIcon,
} from "../ui/Icons.js";

export interface ComparisonPaneProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  paneId: number;
  onCancelPane: (paneId: number) => void;
}

/**
 * One pane of the comparison workspace.
 *
 * A pane is fully independent: its own model, its own stream, its own stop
 * button, its own error state. Cancelling or retrying one pane never touches
 * the others.
 */
export function ComparisonPane({ state, dispatch, paneId, onCancelPane }: ComparisonPaneProps) {
  const pane = state.panes.find((p) => p.id === paneId);
  const [copied, setCopied] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);

  if (!pane) return null;

  const streaming = pane.status === "streaming";
  const model = useMemoModel(state, pane.providerId, pane.modelId);

  const menuItems: MenuItem[] = useMemo(() => {
    const selected = new Set<string>();
    for (const p of state.panes) {
      if (p.providerId && p.modelId) selected.add(`${p.providerId}:${p.modelId}`);
    }

    const items: MenuItem[] = [];
    const favourites = state.models.filter((m) => m.favourite);
    if (favourites.length > 0) {
      items.push({ id: "fav-heading", label: "Favourites", heading: "Favourites", onSelect: () => {} });
      for (const m of favourites) {
        const key = `${m.providerId}:${m.modelId}`;
        items.push({
          id: `fav-${key}`,
          label: m.displayName,
          hint: m.provider.displayName,
          icon: <StarIcon size={12} />,
          onSelect: () =>
            dispatch({
              type: "pane/model",
              paneId,
              providerId: m.providerId,
              modelId: m.modelId,
              modelLabel: m.displayName,
            }),
        });
      }
    }

    const byProvider = new Map<string, typeof state.models>();
    for (const m of state.models) {
      const list = byProvider.get(m.provider.displayName);
      if (list) list.push(m);
      else byProvider.set(m.provider.displayName, [m]);
    }

    for (const [providerName, models] of byProvider) {
      items.push({ id: `p-${providerName}`, label: "", heading: providerName, onSelect: () => {} });
      for (const m of models) {
        const key = `${m.providerId}:${m.modelId}`;
        items.push({
          id: `m-${key}`,
          label: m.displayName,
          hint: selected.has(key) ? "in use" : undefined,
          disabled: selected.has(key),
          onSelect: () =>
            dispatch({
              type: "pane/model",
              paneId,
              providerId: m.providerId,
              modelId: m.modelId,
              modelLabel: m.displayName,
            }),
        });
      }
    }
    return items;
  }, [state.models, state.panes, dispatch, paneId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pane.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section
      aria-label={`Pane ${paneId + 1}`}
      className={cn(
        "flex min-h-[320px] flex-col rounded-xl border bg-surface-raised",
        pane.status === "failed" ? "border-state-danger/40" : "border-line-subtle",
      )}
    >
      {/* Pane header */}
      <header className="flex items-center gap-1.5 border-b border-line-subtle px-2.5 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-sunken text-[10px] font-semibold text-ink-faint">
          {paneId + 1}
        </span>

        <DropdownMenu
          label={`Model for pane ${paneId + 1}`}
          align="start"
          items={menuItems}
          trigger={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              onClick={triggerProps.onClick}
              className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-ink-strong transition-colors hover:bg-surface-sunken"
            >
              <span className="truncate">{pane.modelLabel || "Select model"}</span>
              <span className="shrink-0 rotate-90 text-ink-faint">
                <ChevronIcon size={11} />
              </span>
            </button>
          )}
        />

        <button
          type="button"
          aria-label={showMetrics ? "Hide metrics" : "Show metrics"}
          title={showMetrics ? "Hide metrics" : "Show metrics"}
          onClick={() => setShowMetrics((v) => !v)}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
            showMetrics ? "text-brand-600 dark:text-brand-300" : "text-ink-faint hover:text-ink-strong",
          )}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 16.5h13M6 13V8M10 13V4.5M14 13v-3" />
          </svg>
        </button>

        {streaming ? (
          <Button size="sm" variant="secondary" onClick={() => onCancelPane(paneId)}>
            <StopIcon size={12} />
            Stop
          </Button>
        ) : pane.content ? (
          <button
            type="button"
            aria-label="Copy response"
            title={copied ? "Copied" : "Copy response"}
            onClick={() => void copy()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:text-ink-strong"
          >
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          </button>
        ) : null}
      </header>

      {/* Pane body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {pane.content ? (
          <Markdown content={pane.content} streaming={streaming} />
        ) : streaming ? (
          <p className="flex items-center gap-2 text-[12px] text-ink-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" />
            Waiting for the first token…
          </p>
        ) : pane.status === "failed" ? (
          <div className="flex items-start gap-2 rounded-lg border border-state-danger/30 bg-state-danger-bg px-2.5 py-2">
            <span className="mt-px shrink-0 text-state-danger-strong">
              <WarningIcon size={13} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-state-danger-strong">Request failed</p>
              <p className="mt-0.5 break-words text-[11px] leading-snug text-state-danger-strong/90">
                {pane.error?.message ?? "The provider returned an error."}
              </p>
              {pane.error?.retryable ? (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Looks temporary. Send the prompt again to retry just this pane.
                </p>
              ) : null}
            </div>
          </div>
        ) : pane.status === "cancelled" ? (
          <p className="text-[12px] text-ink-muted">Stopped before completion.</p>
        ) : (
          <p className="text-[12px] leading-relaxed text-ink-faint">
            {model?.description ??
              "Ready. Send a prompt to see this model's answer here."}
          </p>
        )}
      </div>

      {/* Pane footer */}
      <footer className="border-t border-line-subtle px-3 py-2">
        {showMetrics ? (
          <MetricsRow
            metrics={pane.metrics}
            contextWindow={pane.contextWindow ?? model?.contextWindow ?? null}
            compact
          />
        ) : (
          <p className="text-[11px] text-ink-faint">
            {pane.requestId ? "running" : "idle"}
            {model?.contextWindow ? ` · ${model.contextWindow.toLocaleString()} token context` : ""}
          </p>
        )}
      </footer>
    </section>
  );
}

function useMemoModel(state: AppState, providerId: string | null, modelId: string | null) {
  return useMemo(() => {
    if (!providerId || !modelId) return null;
    return state.models.find((m) => m.providerId === providerId && m.modelId === modelId) ?? null;
  }, [state.models, providerId, modelId]);
}
