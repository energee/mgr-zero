/**
 * Builds the model prompt for Ask MGR (`app/api/chat/route.ts`) from stored
 * conversation history plus the incoming user message.
 */
import type { ModelMessage } from "ai";

/** Most recent stored messages sent to the model; keeps a long-lived conversation inside the context window (#460). */
export const MAX_HISTORY_MESSAGES = 40;

/** One row of `get_chat_history.messages`; a user row's `request_id` is the client message id it was appended under. */
export type StoredChatMessage = { role: "user" | "assistant" | "result"; content: string | null; request_id: string | null };

/**
 * Stored history, capped to the last `MAX_HISTORY_MESSAGES`, followed by the
 * new user message. On Try again the client resends the same message id, which
 * is already stored: history is cut at that message so neither it nor the old
 * answer after it reaches the model a second time.
 */
export function buildModelMessages(history: StoredChatMessage[], message: { id: string; text: string }): ModelMessage[] {
  const resent = history.findIndex((stored) => stored.role === "user" && stored.request_id === message.id);
  const messages: ModelMessage[] = (resent === -1 ? history : history.slice(0, resent))
    .filter((stored): stored is StoredChatMessage & { role: "user" | "assistant"; content: string } => stored.role !== "result" && Boolean(stored.content))
    .map((stored) => ({ role: stored.role, content: stored.content }))
    .slice(-MAX_HISTORY_MESSAGES);
  messages.push({ role: "user", content: message.text });
  return messages;
}
