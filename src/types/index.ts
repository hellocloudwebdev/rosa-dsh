export * from "@shared/types.js";
import type { TurnMetrics } from "@shared/types.js";

export type NavItemId =
  | "new-chat"
  | "providers"
  | "models"
  | "prompt-library"
  | "history"
  | "settings";

export interface SuggestionPrompt {
  id: string;
  iconType: "plus" | "scan" | "globe" | "code" | "sparkles";
  verb: string;
  rest: string;
  fullPrompt: string;
  category?: string;
}

export interface Msg {
  id: string | number;
  role: "system" | "user" | "assistant";
  text: string;
  meta?: string;
  providerId?: string | null;
  modelId?: string | null;
  modelLabel?: string | null;
  metrics?: TurnMetrics | null;
  error?: string | null;
  paneIndex?: number | null;
  createdAt?: number;
}

/** Contextual visual surfaces shown in the right-hand View panel. */
export type ViewType =
  | "inspector"
  | "diff"
  | "markdown"
  | "code"
  | "json"
  | "models"
  | "providers";

export interface ChatPane {
  id: number;
  providerId: string;
  modelId: string;
  modelLabel: string;
  streaming: boolean;
  streamingContent: string;
  metrics: TurnMetrics | null;
  error: string | null;
  activeRequestId?: string | null;
}
