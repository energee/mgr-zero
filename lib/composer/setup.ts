// lib/composer/setup.ts — opens the Ask MGR drawer's conversation: restores the
// actor's latest one with its history, or creates the first. The caller's
// signal bounds the whole load, so a stalled request ends in the drawer's
// failure state with Try again instead of an endless opening message (#1105).
import type { UIMessage } from "ai";

type StoredMessage = { id: string; role: "user" | "assistant" | "result"; content: string | null };
type SetupRun = (name: string, input: unknown, requestId: string | undefined, signal: AbortSignal) => Promise<unknown>;

/** What the drawer says while setup runs, beside its progress bar. */
export const COMPOSER_SETUP_ACTIVITY = "Opening your conversation… Input becomes available when setup finishes. If this persists, retry setup or ask your administrator to check the connection.";
/** How long the drawer waits for setup before showing the failure and Try again. */
export const COMPOSER_SETUP_TIMEOUT_MS = 15_000;
export const COMPOSER_SETUP_TIMEOUT_MESSAGE = "Ask MGR couldn't start. Check your connection, then try again.";

/** `createRequestId` names the create_chat_conversation write; the caller keeps
 *  it across retries so a create that committed after a timeout is not repeated. */
export async function loadComposerSetup(run: SetupRun, createRequestId: string, signal: AbortSignal) {
  try {
    const conversations = await run("list_chat_conversations", {}, undefined, signal) as { id: string }[];
    if (!conversations[0]) {
      const created = await run("create_chat_conversation", { title: "MGR conversation" }, createRequestId, signal) as { id: string };
      return { conversationId: created.id, messages: [] as UIMessage[] };
    }
    const conversationId = conversations[0].id;
    const history = await run("get_chat_history", { conversationId }, undefined, signal) as { messages: StoredMessage[] };
    const messages = history.messages.filter((message) => message.role !== "result" && message.content).map((message) => ({
      id: message.id, role: message.role as "user" | "assistant", parts: [{ type: "text", text: message.content! }],
    })) as UIMessage[];
    return { conversationId, messages };
  } catch (cause) {
    // An abort can surface as a TimeoutError or, mid-body, as a malformed
    // response; the signal says which happened.
    if (signal.aborted) throw new Error(COMPOSER_SETUP_TIMEOUT_MESSAGE, { cause });
    throw cause;
  }
}
