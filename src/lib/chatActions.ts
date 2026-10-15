import type { ChatMessage } from "../../shared/types.js";
import type { Action, AppState, ChatMessageView } from "../state/appState.js";

export type SendHandler = (conversationId: string, text: string) => void | Promise<void>;

/**
 * Re-send the transcript up to (but excluding) the given assistant message.
 *
 * Regeneration never fabricates a replacement: it re-issues the same user
 * message and streams a fresh answer from the same model. A toast explains
 * what is happening, because the old answer stays visible until the new one
 * arrives.
 */
export async function regenerateLastTurn(
  state: AppState,
  dispatch: React.Dispatch<Action>,
  onSend: SendHandler,
  assistantIndex: number,
): Promise<void> {
  const visible = state.messages.filter((m) => m.role !== "system");
  const target = visible[assistantIndex];
  if (!target || target.role !== "assistant") return;

  // Walk back to the user message that produced this assistant turn.
  let userIndex = assistantIndex - 1;
  while (userIndex >= 0 && visible[userIndex]?.role !== "user") userIndex -= 1;
  const userMessage = userIndex >= 0 ? visible[userIndex] : null;
  if (!userMessage) return;

  dispatch({
    type: "toast/push",
    toast: {
      id: `regen-${Date.now()}`,
      tone: "info",
      message: "Re-sending the same prompt — a fresh answer will stream in.",
    },
  });

  await onSend(target.conversationId, userMessage.content);
}

/**
 * Edit-and-resend.
 *
 * The edited text is sent as a new turn; the original is left untouched so the
 * transcript stays an accurate record of what was actually asked.
 */
export async function editAndResend(
  state: AppState,
  onSend: SendHandler,
  editedText: string,
): Promise<void> {
  const trimmed = editedText.trim();
  if (!trimmed) return;
  await onSend(state.activeConversationId ?? "", trimmed);
}

/** Copy text without letting a blocked clipboard break the caller. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** True for messages that came back from the server (they have an id). */
export function isPersistedMessage(
  message: ChatMessageView,
): message is ChatMessage & { clientId: string } {
  return Boolean(message.id);
}
