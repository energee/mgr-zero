import { z } from "zod";
import { composerProposal, type ComposerProposal } from "@/lib/composer/state";

/** The longest chat message MGR accepts: the request schema, the message box, and the chat_messages check all use 4,000. */
export const MAX_CHAT_MESSAGE_CHARS = 4000;

type Message = { role?: string; parts?: unknown[] };

export function composerMessageText(message: Message) {
  return (message.parts ?? []).flatMap((part) => {
    if (!part || typeof part !== "object" || !("type" in part) || part.type !== "text" || !("text" in part) || typeof part.text !== "string") return [];
    return part.text;
  }).join("");
}

/** Operator-facing text for a proposal the panel cannot show; the schema detail goes to the console. */
export const PROPOSAL_ERROR = "MGR proposed a change this panel cannot confirm. Nothing was recorded. Ask again, or use Record movement on Inventory.";

/**
 * The record_movement proposal awaiting confirmation in the newest assistant
 * message, or an operator error when that proposal fails composerProposal. The
 * agent can propose any AI-exposed command (ChatCommandProposal in
 * lib/chat/agent.ts), but the panel renders and commits only record_movement,
 * so anything else returns `error` and never reaches the commit button. Only
 * the newest assistant message counts: a later reply supersedes an older
 * proposal, valid or not. Returns a value rather than throwing because the
 * Composer calls it during render in the staff layout (#463).
 */
export function latestComposerProposal(messages: Message[]): { proposal: ComposerProposal | null; error?: string } {
  const latest = messages.findLast((message) => message.role === "assistant");
  for (const part of (latest?.parts ?? []).toReversed()) {
    if (!part || typeof part !== "object" || !("type" in part) || typeof part.type !== "string" || !part.type.startsWith("tool-")
      || !("state" in part) || part.state !== "output-available" || !("output" in part) || !part.output || typeof part.output !== "object"
      || !("status" in part.output) || part.output.status !== "awaiting_confirmation" || !("proposal" in part.output)) continue;
    const parsed = composerProposal.safeParse(part.output.proposal);
    if (parsed.success) return { proposal: parsed.data };
    console.error(`Composer proposal rejected: ${z.prettifyError(parsed.error)}`);
    return { proposal: null, error: PROPOSAL_ERROR };
  }
  return { proposal: null };
}
