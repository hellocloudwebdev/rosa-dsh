import { useEffect, useRef } from "react";
import type { Action, AppState, PaneStatus } from "../../state/appState.js";
import { MessageBubble } from "./MessageBubble.js";
import { EmptyConversation } from "./EmptyConversation.js";
import { regenerateLastTurn } from "../../lib/chatActions.js";

export interface MessageListProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onSend: (conversationId: string, text: string) => void | Promise<void>;
}

/** The single-model chat transcript. */
export function MessageList({ state, dispatch, onSend }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const visible = state.messages.filter((m) => m.role !== "system");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length]);

  if (visible.length === 0) {
    return <EmptyConversation state={state} dispatch={dispatch} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 sm:px-5">
      {visible.map((message, index) => (
        <MessageBubble
          key={message.clientId}
          message={message}
          isLast={index === visible.length - 1}
          onRegenerate={
            message.role === "assistant"
              ? () => void regenerateLastTurn(state, dispatch, onSend, index)
              : undefined
          }
        />
      ))}

      {/* Live pane output is the tail of the transcript in single mode. */}
      {state.panes.map((pane) =>
        pane.status === "streaming" || pane.content ? (
          <PaneTail key={pane.id} state={state} paneId={pane.id} />
        ) : null,
      )}

      <div ref={endRef} />
    </div>
  );
}

function PaneTail({ state, paneId }: { state: AppState; paneId: number }) {
  const pane = state.panes.find((p) => p.id === paneId);
  if (!pane) return null;

  return (
    <MessageBubble
      message={{
        clientId: `pane-${paneId}`,
        id: "",
        conversationId: state.activeConversationId ?? "",
        role: "assistant",
        content: pane.content,
        providerId: pane.providerId,
        modelId: pane.modelId,
        modelLabel: pane.modelLabel,
        status: null,
        metrics: null,
        error: null,
        parentMessageId: null,
        paneIndex: null,
        createdAt: Date.now(),
      }}
      isLast
      paneStatus={pane.status as PaneStatus}
      paneError={pane.error}
      paneMetrics={pane.metrics}
    />
  );
}
