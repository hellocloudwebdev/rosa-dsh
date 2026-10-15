import { useMemo } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { ComparisonPane } from "./ComparisonPane.js";
import { Button } from "../ui/Button.js";
import { PlusIcon, CompareIcon } from "../ui/Icons.js";

export interface PaneGridProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onCancelPane: (paneId: number) => void;
}

const MAX_PANES = 4;

/**
 * The comparison workspace's grid.
 *
 * Mobile renders one pane at a time with a tab strip, because four side-by-side
 * columns on a phone would be unreadable. Desktop uses a real column grid.
 */
export function PaneGrid({ state, dispatch, onCancelPane }: PaneGridProps) {
  const panes = state.panes;
  const canAdd = panes.length < MAX_PANES;

  const unconfigured = panes.filter((p) => !p.providerId || !p.modelId).length;

  if (unconfigured === panes.length) {
    return <NoPanesConfigured state={state} dispatch={dispatch} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {unconfigured > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-state-warning/30 bg-state-warning-bg px-3 py-2">
          <p className="text-[12px] leading-snug text-state-warning-strong">
            {unconfigured} pane{unconfigured === 1 ? "" : "s"} ha
            {unconfigured === 1 ? "s" : "ve"} no model selected and won&apos;t receive the prompt.
          </p>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "mode/set", mode: "single" })}>
            Manage models
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-ink-faint">
          {panes.length} of {MAX_PANES} panes · one submit reaches every model
        </p>
        {canAdd ? (
          <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "pane/count", count: (panes.length + 1) as 2 | 3 | 4 })}>
            <PlusIcon size={13} />
            Add pane
          </Button>
        ) : null}
      </div>

      {/* Mobile: tabs + one pane. */}
      <MobilePanes panes={panes} state={state} dispatch={dispatch} onCancelPane={onCancelPane} />

      {/* Desktop: real column grid. */}
      <div
        className={cn(
          "hidden gap-3 md:grid",
          panes.length === 1 && "grid-cols-1",
          panes.length === 2 && "grid-cols-2",
          panes.length === 3 && "grid-cols-3",
          panes.length === 4 && "grid-cols-4",
        )}
      >
        {panes.map((pane) => (
          <ComparisonPane
            key={pane.id}
            state={state}
            dispatch={dispatch}
            paneId={pane.id}
            onCancelPane={onCancelPane}
          />
        ))}
      </div>
    </div>
  );
}

function MobilePanes({
  panes,
  state,
  dispatch,
  onCancelPane,
}: {
  panes: AppState["panes"];
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onCancelPane: (paneId: number) => void;
}) {
  const active = useMemo(() => {
    if (panes.length === 0) return null;
    const current = panes.find((p) => p.id === state.activePaneId);
    return current?.id ?? panes[0].id;
  }, [panes, state.activePaneId]);

  const activePane = panes.find((p) => p.id === active);
  if (!activePane) return null;

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div role="tablist" aria-label="Comparison panes" className="flex gap-1.5 overflow-x-auto pb-1">
        {panes.map((pane, index) => (
          <button
            key={pane.id}
            type="button"
            role="tab"
            aria-selected={pane.id === active}
            onClick={() => dispatch({ type: "pane/active", paneId: pane.id })}
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
              pane.id === active
                ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
                : "border-line-subtle text-ink-muted",
            )}
          >
            {index + 1}. {pane.modelLabel || "Pick model"}
          </button>
        ))}
      </div>
      <ComparisonPane state={state} dispatch={dispatch} paneId={activePane.id} onCancelPane={onCancelPane} />
    </div>
  );
}

function NoPanesConfigured({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}) {
  const favourites = state.models.filter((m) => m.favourite).slice(0, 4);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-subtle bg-surface px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken text-ink-faint">
        <CompareIcon size={20} />
      </span>
      <div>
        <h3 className="text-[15px] font-semibold text-ink-strong">Choose the models to compare</h3>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-muted">
          Pick one model per pane. The same prompt goes to every pane at once,
          each streams independently, and each can be stopped on its own.
        </p>
      </div>

      {favourites.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Quick-pick from favourites
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {favourites.map((model) => (
              <button
                key={`${model.providerId}:${model.modelId}`}
                type="button"
                onClick={() => {
                  const target = state.panes.find((p) => !p.providerId || !p.modelId);
                  dispatch({
                    type: "pane/model",
                    paneId: target?.id ?? state.panes[0].id,
                    providerId: model.providerId,
                    modelId: model.modelId,
                    modelLabel: model.displayName,
                  });
                }}
                className="rounded-full border border-line-subtle px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-strong"
              >
                {model.displayName}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-ink-faint">
          No favourites yet — star models in the Model library to quick-pick them here.
        </p>
      )}
    </div>
  );
}
