import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ApiErrorPayload, StreamEvent, UserProfile } from "../shared/types.js";
import {
  ApiClientError,
  cancelRun,
  createConversation,
  deleteConversation,
  getConversation,
  getHealth,
  getSession,
  listConversations,
  listModels,
  listProviders,
  logout,
  openChatStream,
  readChatStream,
} from "./lib/api.js";
import { ToastProvider } from "./components/ui/Toast.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { AppShell } from "./components/shell/AppShell.js";
import { Sidebar } from "./components/shell/Sidebar.js";
import { Workspace } from "./components/workspace/Workspace.js";
import { reducer, initialState, type Action, type ChatMessageView, type PaneState, type PaneMetrics } from "./state/appState.js";

type Stage = "booting" | "signed-out" | "signed-in";

export function App() {
  return (
    <ToastProvider>
      <AppRoot />
    </ToastProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

function AppRoot() {
  const [stage, setStage] = useState<Stage>("booting");
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    void (async () => {
      try {
        const session = await getSession(controller.signal);
        if (!alive) return;
        setStage(session.user ? "signed-in" : "signed-out");
      } catch (err) {
        if (!alive) return;
        setBootError(
          err instanceof ApiClientError
            ? err.message
            : "Could not reach the ROSA API. Start the API server (`npm run dev:api`) and reload.",
        );
        setStage("signed-out");
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  if (stage === "booting") return <BootScreen />;

  return stage === "signed-in" ? (
    <SignedInApp />
  ) : (
    <LoginScreen bootError={bootError} onSignedIn={() => setStage("signed-in")} />
  );
}

function BootScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-line-strong border-t-brand-600" />
        <p className="text-[13px] text-ink-muted">Loading ROSA…</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Signed-in application                                               */
/* ------------------------------------------------------------------ */

function SignedInApp() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const refreshProviders = useCallback(async () => {
    const { providers } = await listProviders();
    dispatch({ type: "providers/set", providers });
    return providers;
  }, []);

  const refreshModels = useCallback(async () => {
    const { models } = await listModels();
    dispatch({ type: "models/set", models });
    return models;
  }, []);

  const refreshConversations = useCallback(async () => {
    const res = await listConversations({ limit: 100 });
    dispatch({ type: "conversations/set", conversations: res.conversations });
    return res.conversations;
  }, []);

  const refreshAll = useCallback(async () => {
    const [health, session, providers, models, conversations] = await Promise.all([
      getHealth(),
      getSession(),
      listProviders(),
      listModels(),
      listConversations({ limit: 100 }),
    ]);
    dispatch({
      type: "boot/ready",
      payload: {
        health,
        user: session.user,
        providers: providers.providers,
        models: models.models,
      },
    });
    dispatch({ type: "conversations/set", conversations: conversations.conversations });
  }, []);

  useEffect(() => {
    void refreshAll().catch((err) => {
      dispatch({
        type: "toast/push",
        toast: {
          id: `load-${Date.now()}`,
          tone: "danger",
          message: "Could not load your workspace.",
          detail: err instanceof Error ? err.message : String(err),
        },
      });
    });
  }, [refreshAll]);

  const handleLogout = useCallback(async () => {
    await logout().catch(() => undefined);
    window.location.href = "/";
  }, []);

  const user: UserProfile | null = state.user;

  const openConversation = useCallback(async (id: string) => {
    const res = await getConversation(id);
    dispatch({ type: "conversation/active", id });
    dispatch({ type: "messages/set", messages: res.messages.map(toChatMessageView) });
  }, []);

  const startNewConversation = useCallback(async () => {
    try {
      const { conversation } = await createConversation({
        paneCount: state.paneCount,
        paneModels: state.panes.map((pane) =>
          pane.providerId && pane.modelId
            ? { providerId: pane.providerId, modelId: pane.modelId }
            : null,
        ),
      });
      dispatch({ type: "conversation/created", conversation });
      dispatch({ type: "messages/set", messages: [] });
      return conversation;
    } catch (err) {
      dispatch({
        type: "toast/push",
        toast: {
          id: `conv-${Date.now()}`,
          tone: "danger",
          message: "Could not start a conversation.",
          detail: err instanceof Error ? err.message : String(err),
        },
      });
      return null;
    }
  }, [state.paneCount, state.panes]);

  const removeConversation = useCallback(async (id: string) => {
    await deleteConversation(id).catch(() => undefined);
    dispatch({ type: "conversation/removed", id });
  }, []);

  /** AbortControllers keyed by pane id, so cancelling one pane is isolated. */
  const paneControllers = useRef(new Map<number, AbortController>());

  const sendToPane = useCallback(
    async (
      paneId: number,
      conversationId: string | null,
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    ) => {
      const pane = state.panes.find((p) => p.id === paneId);
      if (!pane?.providerId || !pane.modelId) {
        dispatch({
          type: "toast/push",
          toast: {
            id: `sel-${paneId}-${Date.now()}`,
            tone: "warning",
            message: "A pane has no model selected.",
          },
        });
        return;
      }

      const model = state.models.find(
        (m) => m.providerId === pane.providerId && m.modelId === pane.modelId,
      );
      const requestId = crypto.randomUUID();
      const controller = new AbortController();
      paneControllers.current.set(paneId, controller);
      deltaBuffers.delete(paneId);

      dispatch({
        type: "pane/run-start",
        paneId,
        requestId,
        providerId: pane.providerId,
        modelId: pane.modelId,
        modelLabel: model?.displayName ?? pane.modelId,
      });

      // The context window becomes known before the first token arrives.
      if (model?.contextWindow) {
        dispatch({ type: "pane/context", paneId, contextWindow: model.contextWindow });
      }

      try {
        const res = await openChatStream(
          {
            providerId: pane.providerId,
            modelId: pane.modelId,
            modelLabel: model?.displayName ?? pane.modelId,
            messages,
            stream: true,
            temperature: state.temperature,
            maxTokens: state.maxTokens,
            conversationId,
            requestId,
          },
          controller.signal,
        );

        if (!res.ok) {
          const text = await res.text();
          dispatch({ type: "pane/error", paneId, error: parseErrorPayload(text, res.status) });
          return;
        }

        await readChatStream(res, {
          onEvent: (event: StreamEvent) => applyStreamEvent(event, paneId, dispatch),
          onNetworkError: (error: ApiErrorPayload) =>
            dispatch({ type: "pane/error", paneId, error }),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        dispatch({
          type: "pane/error",
          paneId,
          error: {
            code: "transport",
            message: err instanceof Error ? err.message : String(err),
            retryable: true,
          },
        });
      } finally {
        paneControllers.current.delete(paneId);
      }
    },
    [state.panes, state.models, state.temperature, state.maxTokens],
  );

  const cancelPane = useCallback(
    (paneId: number) => {
      const controller = paneControllers.current.get(paneId);
      if (controller) {
        controller.abort();
        paneControllers.current.delete(paneId);
      }
      const pane = state.panes.find((p) => p.id === paneId);
      if (pane?.requestId) void cancelRun(pane.requestId);
    },
    [state.panes],
  );

  const handleSend = useCallback(
    async (convId: string, text: string) => {
      let conversationId: string | null = convId ?? state.activeConversationId;
      if (!conversationId) {
        const created = await startNewConversation();
        conversationId = created?.id ?? null;
      }
      if (!conversationId) return;

      const history = state.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const systemPrefix = state.systemPrompt.trim()
        ? [{ role: "system" as const, content: state.systemPrompt.trim() }]
        : [];

      const targetPanes =
        state.mode === "compare" ? state.panes : [state.panes[0] ?? makePane(1)];

      for (const pane of targetPanes) {
        if (!pane.providerId || !pane.modelId) continue;
        await sendToPane(
          pane.id,
          conversationId,
          [...systemPrefix, ...history, { role: "user", content: text }],
        );
      }

      dispatch({
        type: "messages/append",
        message: {
          clientId: `local-${Date.now()}`,
          id: "",
          conversationId,
          role: "user",
          content: text,
          providerId: null,
          modelId: null,
          modelLabel: null,
          status: "completed",
          metrics: null,
          error: null,
          parentMessageId: null,
          paneIndex: null,
          createdAt: Date.now(),
        },
      });
    },
    [
      state.activeConversationId,
      state.messages,
      state.systemPrompt,
      state.mode,
      state.panes,
      sendToPane,
      startNewConversation,
    ],
  );

  return (
    <AppShell
      state={state}
      dispatch={dispatch}
      user={user}
      sidebar={
        <Sidebar
          state={state}
          dispatch={dispatch}
          onOpenConversation={openConversation}
          onNewConversation={startNewConversation}
          onDeleteConversation={removeConversation}
          onLogout={handleLogout}
          onRefreshModels={refreshModels}
          onRefreshConversations={refreshConversations}
        />
      }
    >
      <Workspace
        state={state}
        dispatch={dispatch}
        onSend={handleSend}
        onCancelPane={cancelPane}
        onOpenConversation={openConversation}
        onNewConversation={startNewConversation}
        onRefreshModels={refreshModels}
        onRefreshProviders={refreshProviders}
      />
    </AppShell>
  );
}

function makePane(id: number): PaneState {
  return {
    id,
    providerId: null,
    modelId: null,
    modelLabel: "",
    requestId: null,
    content: "",
    status: "idle",
    error: null,
    metrics: null,
    contextWindow: null,
    submittedMessageId: null,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * The reducer cannot read `pane.content` while updating it, so delta text is
 * accumulated in a buffer keyed by pane id. This keeps the reducer pure while
 * still producing one complete string per frame.
 */
const deltaBuffers = new Map<number, string>();

function applyStreamEvent(
  event: StreamEvent,
  paneId: number,
  dispatch: React.Dispatch<Action>,
): void {
  switch (event.type) {
    case "start":
      deltaBuffers.set(paneId, "");
      dispatch({ type: "pane/active", paneId });
      break;
    case "delta":
      deltaBuffers.set(paneId, (deltaBuffers.get(paneId) ?? "") + event.text);
      dispatch({ type: "pane/delta", paneId, text: deltaBuffers.get(paneId) ?? "" });
      break;
    case "usage":
      dispatch({
        type: "pane/usage",
        paneId,
        metrics: {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          inputTokensEstimated: event.estimated,
          outputTokensEstimated: event.estimated,
        },
      });
      break;
    case "context":
      dispatch({
        type: "pane/context",
        paneId,
        // The provider may report no context window at all. `null` is passed
        // through so the UI can say "unknown" rather than assume zero.
        contextWindow: event.contextWindow ?? null,
      });
      break;
    case "done":
      dispatch({
        type: "pane/done",
        paneId,
        metrics: event.metrics as PaneMetrics,
        finishReason: event.finishReason ?? null,
      });
      break;
    case "error":
      dispatch({ type: "pane/error", paneId, error: event.error });
      break;
    default:
      break;
  }
}

function parseErrorPayload(text: string, status: number): ApiErrorPayload {
  try {
    const parsed = JSON.parse(text) as { error?: ApiErrorPayload };
    if (parsed?.error) return parsed.error;
  } catch {
    /* fall through */
  }
  return {
    code: "internal",
    message: `The request failed with status ${status}.`,
    retryable: status >= 500,
  };
}

function toChatMessageView(message: {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  providerId: string | null;
  modelId: string | null;
  modelLabel: string | null;
  status: string | null;
  metrics: unknown;
  error: unknown;
  parentMessageId: string | null;
  paneIndex: number | null;
  createdAt: number;
}): ChatMessageView {
  return {
    clientId: `srv-${message.id}`,
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    providerId: message.providerId,
    modelId: message.modelId,
    modelLabel: message.modelLabel,
    status: (message.status ?? null) as ChatMessageView["status"],
    metrics: (message.metrics ?? null) as ChatMessageView["metrics"],
    error: (message.error ?? null) as ChatMessageView["error"],
    parentMessageId: message.parentMessageId,
    paneIndex: message.paneIndex,
    createdAt: message.createdAt,
  };
}
