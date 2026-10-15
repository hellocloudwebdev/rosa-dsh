import type {
  ApiErrorPayload,
  ChatMessage,
  Conversation,
  Folder,
  ModelWithProvider,
  PaneMetrics,
  ProviderConfig,
  RequestStatus,
  UserProfile,
} from "../../shared/types.js";
import type { HealthInfo } from "../lib/api.js";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ChatMode = "single" | "compare";

/**
 * A pane's status. "idle" means it has never been asked anything; every other
 * value is the shared `RequestStatus`, so one term describes both the live
 * stream and the persisted message row.
 */
export type PaneStatus = "idle" | RequestStatus;

export interface PaneState {
  /** Stable index 0..3, never reused after removal so metrics stay honest. */
  id: number;
  providerId: string | null;
  modelId: string | null;
  modelLabel: string;
  requestId: string | null;
  /** Streaming text assembled from delta events. */
  content: string;
  /** "idle" before the first submit, otherwise a shared `RequestStatus`. */
  status: PaneStatus;
  error: ApiErrorPayload | null;
  metrics: PaneMetrics | null;
  /** Set once we have seen a `context` event. */
  contextWindow: number | null;  submittedMessageId: string | null;
}

/**
 * A chat message as the UI needs it: the persisted fields plus a client-only
 * key. `clientId` is what React keys on, because persisted ids are assigned
 * server-side and are not available for locally-echoed optimistic messages.
 */
export interface ChatMessageView extends ChatMessage {
  clientId: string;
}

export interface AppState {
  bootPhase: "loading" | "ready" | "error";
  bootError: string | null;
  health: HealthInfo | null;
  user: UserProfile | null;

  providers: ProviderConfig[];
  models: ModelWithProvider[];
  conversations: Array<Conversation & { messageCount: number; lastMessageAt: number | null }>;
  /** Folders the user has created; conversations may sit inside one. */
  folders: Folder[];
  activeConversationId: string | null;
  messages: ChatMessageView[];
  sidebarOpen: boolean;
  sidebarWidth: number;

  /** Workspace configuration, kept here so the composer and panes agree. */
  mode: ChatMode;
  paneCount: 1 | 2 | 3 | 4;
  panes: PaneState[];
  activePaneId: number | null;

  /** The model chosen for single-chat mode. */
  selectedProviderId: string | null;
  selectedModelId: string | null;

  /** Persisted preferences (theme, routing, sidebar width). */
  prefs: import("../lib/api.js").UserPrefs | null;

  /** System prompt applies to every pane. */
  systemPrompt: string;
  temperature: number;
  maxTokens: number | null;

  /** Transient UI state surfaced as toasts. */
  toasts: Array<{
    id: string;
    tone: "info" | "success" | "warning" | "danger";
    message: string;
    detail?: string;
  }>;
}

type Action =
  | { type: "boot/loading" }
  | { type: "boot/ready"; payload: { health: HealthInfo | null; user: UserProfile | null; providers: ProviderConfig[]; models: ModelWithProvider[] } }
  | { type: "boot/error"; message: string }
  | { type: "user/set"; user: UserProfile | null }
  | { type: "providers/set"; providers: ProviderConfig[] }
  | { type: "provider/upsert"; provider: ProviderConfig }
  | { type: "provider/remove"; id: string }
  | { type: "models/set"; models: ModelWithProvider[] }
  | { type: "conversations/set"; conversations: AppState["conversations"] }
  | { type: "conversation/active"; id: string | null }
  | { type: "conversation/created"; conversation: Conversation }
  | { type: "conversation/patched"; id: string; patch: Partial<Conversation> }
  | { type: "conversation/removed"; id: string }
  | { type: "messages/set"; messages: ChatMessageView[] }
  | { type: "messages/append"; message: ChatMessageView }
  | { type: "sidebar/toggle" }
  | { type: "sidebar/width"; width: number }
  | { type: "mode/set"; mode: ChatMode }
  | { type: "pane/count"; count: 1 | 2 | 3 | 4 }
  | { type: "pane/model"; paneId: number; providerId: string | null; modelId: string | null; modelLabel: string }
  | { type: "pane/active"; paneId: number | null }
  | { type: "pane/run-start"; paneId: number; requestId: string; providerId: string; modelId: string; modelLabel: string }
  | { type: "pane/delta"; paneId: number; text: string }
  | { type: "pane/usage"; paneId: number; metrics: Partial<PaneMetrics> }
  | { type: "pane/context"; paneId: number; contextWindow: number | null }
  | { type: "pane/done"; paneId: number; metrics: PaneState["metrics"]; finishReason: string | null }
  | { type: "pane/error"; paneId: number; error: import("../../shared/types.js").ApiErrorPayload }
  | { type: "pane/reset"; paneId: number }
  | { type: "pane/remove"; paneId: number }
  | { type: "selection/model"; providerId: string | null; modelId: string | null }
  | { type: "prompt/system"; value: string }
  | { type: "prompt/temperature"; value: number }
  | { type: "prompt/maxTokens"; value: number | null }
  | { type: "toast/push"; toast: { id: string; tone: ToastTone; message: string; detail?: string } }
  | { type: "toast/dismiss"; id: string }
  | { type: "folders/set"; folders: Folder[] };

/** Tone shared by toasts in state and the Toast presenter. */
export type ToastTone = "info" | "success" | "warning" | "danger";

/** Dispatch type for the app reducer. */
export type Dispatch = React.Dispatch<Action>;

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

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

const initialState: AppState = {
  bootPhase: "loading",
  bootError: null,
  health: null,
  user: null,

  providers: [],
  models: [],
  conversations: [],
  folders: [],
  activeConversationId: null,
  messages: [],

  sidebarOpen: true,
  sidebarWidth: 300,

  mode: "single",
  paneCount: 1,
  panes: [makePane(1)],
  activePaneId: null,

  selectedProviderId: null,
  selectedModelId: null,

  prefs: null,

  systemPrompt: "",
  temperature: 1,
  maxTokens: null,

  toasts: [],
};

/** Grow to exactly `count` panes, preserving existing ones by order. */
function pansOccupied(panes: PaneState[], count: number): PaneState[] {
  const next = [...panes];
  while (next.length < count) {
    next.push(makePane(Math.max(0, ...next.map((p) => p.id)) + 1));
  }
  return next.slice(0, count);
}

function updatePane(panes: PaneState[], paneId: number, patch: Partial<PaneState>): PaneState[] {
  return panes.map((pane) => (pane.id === paneId ? { ...pane, ...patch } : pane));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "boot/loading":
      return { ...initialState, bootPhase: "loading" };

    case "boot/ready":
      return {
        ...state,
        bootPhase: "ready",
        bootError: null,
        health: action.payload.health,
        user: action.payload.user,
        providers: action.payload.providers,
        models: action.payload.models,
      };

    case "boot/error":
      return { ...state, bootPhase: "error", bootError: action.message };

    case "user/set":
      return { ...state, user: action.user };

    case "providers/set":
      return { ...state, providers: action.providers };

    case "provider/upsert":
      return {
        ...state,
        providers: [
          ...state.providers.filter((p) => p.id !== action.provider.id),
          action.provider,
        ].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      };

    case "provider/remove":
      return {
        ...state,
        providers: state.providers.filter((p) => p.id !== action.id),
        models: state.models.filter((m) => m.providerId !== action.id),
        panes: state.panes.map((pane) =>
          pane.providerId === action.id ? { ...makePane(pane.id) } : pane,
        ),
        selectedProviderId:
          state.selectedProviderId === action.id ? null : state.selectedProviderId,
      };

    case "models/set":
      return { ...state, models: action.models };

    case "conversations/set":
      return { ...state, conversations: action.conversations };

    case "conversation/active":
      return { ...state, activeConversationId: action.id };

    case "conversation/created":
      return {
        ...state,
        conversations: [{ ...action.conversation, messageCount: 0, lastMessageAt: null }, ...state.conversations],
        activeConversationId: action.conversation.id,
      };

    case "conversation/patched":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      };

    case "conversation/removed":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.id),
        activeConversationId:
          state.activeConversationId === action.id ? null : state.activeConversationId,
        messages: state.activeConversationId === action.id ? [] : state.messages,
      };

    case "messages/set":
      return {
        ...state,
        messages: action.messages,
        panes: state.panes.map((pane) => ({ ...makePane(pane.id) })),
      };

    case "messages/append":
      return { ...state, messages: [...state.messages, action.message] };

    case "sidebar/toggle":
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case "sidebar/width":
      return { ...state, sidebarWidth: action.width };

    case "mode/set": {
      const mode = action.mode;
      // Switching to compare always guarantees at least two panes; switching
      // back to single keeps pane 1 so the selection survives.
      const paneCount = mode === "compare" ? Math.max(2, state.paneCount) : state.paneCount;
      const panes = mode === "compare" ? pansOccupied(state.panes, paneCount as 1 | 2 | 3 | 4) : state.panes;
      return { ...state, mode, paneCount: paneCount as 1 | 2 | 3 | 4, panes };
    }

    case "pane/count":
      return {
        ...state,
        paneCount: action.count,
        panes: pansOccupied(state.panes, action.count),
      };

    case "pane/model":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          providerId: action.providerId,
          modelId: action.modelId,
          modelLabel: action.modelLabel,
        }),
      };

    case "pane/active":
      return { ...state, activePaneId: action.paneId };

    case "pane/run-start":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          providerId: action.providerId,
          modelId: action.modelId,
          modelLabel: action.modelLabel,
          requestId: action.requestId,
          content: "",
          status: "streaming",
          error: null,
          metrics: null,
          contextWindow: null,
        }),
      };

    case "pane/delta":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          content: action.text,
          status: "streaming",
        }),
      };

    case "pane/usage": {
      const existing = state.panes.find((p) => p.id === action.paneId)?.metrics ?? baseMetrics();
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          metrics: { ...existing, ...action.metrics } satisfies PaneMetrics,
        }),
      };
    }

    case "pane/context":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, { contextWindow: action.contextWindow }),
      };

    case "pane/done":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          status: action.finishReason === "cancelled" ? "cancelled" : "completed",
          metrics: action.metrics,
          requestId: null,
        }),
      };

    case "pane/error":
      return {
        ...state,
        panes: updatePane(state.panes, action.paneId, {
          status: "failed",
          error: action.error,
          requestId: null,
        }),
      };

    case "pane/reset":
      return {
        ...state,
        panes: state.panes.map((pane) => (pane.id === action.paneId ? { ...makePane(pane.id), providerId: pane.providerId, modelId: pane.modelId, modelLabel: pane.modelLabel } : pane)),
      };

    case "pane/remove":
      return {
        ...state,
        panes: state.panes.filter((pane) => pane.id !== action.paneId),
        paneCount: Math.max(1, state.panes.length - 1) as 1 | 2 | 3 | 4,
      };

    case "selection/model":
      return { ...state, selectedProviderId: action.providerId, selectedModelId: action.modelId };

    case "prompt/system":
      return { ...state, systemPrompt: action.value };

    case "prompt/temperature":
      return { ...state, temperature: action.value };

    case "prompt/maxTokens":
      return { ...state, maxTokens: action.value };

    case "folders/set":
      return { ...state, folders: action.folders };

    case "toast/push":
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] };

    case "toast/dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    default:
      return state;
  }
}

function baseMetrics(): PaneMetrics {
  return {
    ttftMs: null,
    firstResponseMs: null,
    generationMs: null,
    totalMs: null,
    outputTokens: null,
    inputTokens: null,
    outputTokensEstimated: false,
    inputTokensEstimated: false,
    tokensPerSecond: null,
    tokensPerSecondEstimated: false,
    contextWindow: null,
  };
}

export { reducer, initialState, baseMetrics };
export type { Action, PaneMetrics };
