import { useEffect, useRef } from "react";
import type { Action, AppState } from "../../state/appState.js";
import { cn } from "../../lib/cn.js";
import { MessageList } from "./MessageList.js";
import { Composer } from "./Composer.js";
import { PaneGrid } from "./PaneGrid.js";
import { FirstRunSetup } from "./FirstRunSetup.js";
import { ComparisonSummary } from "./ComparisonSummary.js";

export interface WorkspaceProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onSend: (conversationId: string, text: string) => void | Promise<void>;
  onCancelPane: (paneId: number) => void;
  onOpenConversation: (id: string) => void | Promise<void>;
  onNewConversation: () => Promise<unknown>;
  onRefreshModels: () => Promise<unknown>;
  onRefreshProviders: () => Promise<unknown>;
}

/**
 * The chat workspace.
 *
 * Single mode renders the history stream plus one composer. Compare mode
 * renders the composer once at the top (so one submit fans out to every pane)
 * and then one independently-streaming pane per model.
 */
export function Workspace({
  state,
  dispatch,
  onSend,
  onCancelPane,
  onRefreshModels,
  onRefreshProviders,
}: WorkspaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCompare = state.mode === "compare";

  // Keep the latest turn visible while streaming, without fighting the user
  // when they have deliberately scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 140) {
      el.scrollTop = el.scrollHeight;
    }
  }, [state.messages, state.panes.map((p) => p.content).join("")]);

  const anyStreaming = state.panes.some((p) => p.status === "streaming");
  const hasModels = state.models.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hasModels ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FirstRunSetup
            state={state}
            dispatch={dispatch}
            onRefreshModels={onRefreshModels}
            onRefreshProviders={onRefreshProviders}
          />
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-line-subtle px-3 py-2.5 sm:px-5">
            <Composer
              state={state}
              dispatch={dispatch}
              onSend={onSend}
              streaming={anyStreaming}
            />
          </div>

          <div
            ref={scrollRef}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              isCompare ? "bg-surface-sunken/40" : "bg-surface",
            )}
          >
            {isCompare ? (
              <div className="flex min-h-full flex-col gap-3 p-3 sm:p-4">
                <ComparisonSummary state={state} />
                <PaneGrid state={state} dispatch={dispatch} onCancelPane={onCancelPane} />
              </div>
            ) : (
              <MessageList state={state} dispatch={dispatch} onSend={onSend} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
