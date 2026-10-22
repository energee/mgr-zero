// lib/composer/setup.ts — opens the Ask MGR drawer's conversation: restores the
// person's latest one with its history, or creates the first. A timeout bounds
// the whole load, so a stalled request ends in the drawer's failure state with
// Try again instead of an endless opening message (#1105).
import type { UIMessage } from "ai";

type StoredMessage = { id: string; role: "user" | "assistant" | "result"; content: string | null };
type SetupRun = (name: string, input: unknown, requestId: string | undefined, signal: AbortSignal) => Promise<unknown>;

/** What the drawer says while setup runs, beside its pulsing bar. */
export const COMPOSER_SETUP_ACTIVITY = "Opening your conversation… You can type once it opens.";
/** How long the drawer waits for setup before showing the failure and Try again. */
export const COMPOSER_SETUP_TIMEOUT_MS = 15_000;
export const COMPOSER_SETUP_TIMEOUT_MESSAGE = "Ask MGR could not start. Check your connection, then try again.";

/** `createRequest` holds the create_chat_conversation request id. The caller
 *  keeps one holder across retries, so a create that committed after a timeout
 *  is not repeated. `superseded` aborts a load that a newer retry replaced. */
export async function loadComposerSetup(run: SetupRun, createRequest: { current: string | undefined }, superseded: AbortSignal) {
  const timeout = AbortSignal.timeout(COMPOSER_SETUP_TIMEOUT_MS);
  // A signalled command() skips its failure invalidation (lib/commands/client.ts).
  // That is safe: only this load reads chat conversations, and a retry re-lists them.
  const signal = AbortSignal.any([superseded, timeout]);
  try {
    const conversations = await run("list_chat_conversations", {}, undefined, signal) as { id: string }[];
    if (!conversations[0]) {
      const created = await run("create_chat_conversation", { title: "MGR conversation" }, createRequest.current ??= crypto.randomUUID(), signal) as { id: string };
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
    // response; the timeout signal says whether the clock ran out.
    if (timeout.aborted) throw new Error(COMPOSER_SETUP_TIMEOUT_MESSAGE, { cause });
    throw cause;
  }
}
