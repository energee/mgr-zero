// lib/composer/setup.ts — opens the Ask MGR drawer's conversation: restores the
// person's latest one with its newest text turns, or creates the first. A
// timeout bounds the whole load, so a stalled request ends in the drawer's
// failure state with Try again instead of an endless opening message (#1105).
import type { UIMessage } from "ai";
import { MAX_HISTORY_MESSAGES } from "@/lib/chat/model-messages";

/** A text turn from get_chat_history with recentTurns: it never returns result rows. */
type StoredMessage = { id: string; role: "user" | "assistant"; content: string };
type SetupRun = (name: string, input: unknown, requestId: string | undefined, signal: AbortSignal) => Promise<unknown>;

/** What the drawer says while setup runs, beside its pulsing bar. */
export const COMPOSER_SETUP_ACTIVITY = "Opening your conversation… You can type once it opens.";
/** How long the drawer waits for setup before showing the failure and Try again. */
export const COMPOSER_SETUP_TIMEOUT_MS = 15_000;
export const COMPOSER_SETUP_TIMEOUT_MESSAGE = "Ask MGR could not start. Check your connection, then try again.";

/** `createRequest` holds the create_chat_conversation request id. The caller
 *  keeps one holder across retries, so a create that committed after a timeout
 *  is not repeated. The caller aborts `signal` when a newer load replaces this one. */
export async function loadComposerSetup(run: SetupRun, createRequest: { current: string | undefined }, signal: AbortSignal) {
  const timeout = AbortSignal.timeout(COMPOSER_SETUP_TIMEOUT_MS);
  // command() given a signal does not send its data-changed event on failure
  // (lib/commands/client.ts). That is safe: the event only refreshes the cached
  // screen reads in lib/commands/query-cache.ts, and no chat data is cached there.
  const requestSignal = AbortSignal.any([signal, timeout]);
  try {
    const conversations = await run("list_chat_conversations", {}, undefined, requestSignal) as { id: string }[];
    if (!conversations[0]) {
      const created = await run("create_chat_conversation", { title: "MGR conversation" }, createRequest.current ??= crypto.randomUUID(), requestSignal) as { id: string };
      return { conversationId: created.id, messages: [] as UIMessage[] };
    }
    const conversationId = conversations[0].id;
    // Only the newest text turns, the same window the model sees, so the load does not grow with the conversation (#1169).
    const history = await run("get_chat_history", { conversationId, recentTurns: MAX_HISTORY_MESSAGES }, undefined, requestSignal) as { messages: StoredMessage[] };
    const messages = history.messages.map((message) => ({
      id: message.id, role: message.role, parts: [{ type: "text", text: message.content }],
    })) as UIMessage[];
    return { conversationId, messages };
  } catch (cause) {
    // A timeout can surface as a TimeoutError or, mid-body, as a malformed
    // response. So the clock decides: any failure after it ran out is a timeout.
    if (timeout.aborted) throw new Error(COMPOSER_SETUP_TIMEOUT_MESSAGE, { cause });
    throw cause;
  }
}
