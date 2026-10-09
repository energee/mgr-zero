import { z } from "zod";
import { composerProposal, type ComposerProposal } from "@/lib/composer/state";

type Message = { parts?: unknown[] };

export function composerMessageText(message: Message) {
  return (message.parts ?? []).flatMap((part) => {
    if (!part || typeof part !== "object" || !("type" in part) || part.type !== "text" || !("text" in part) || typeof part.text !== "string") return [];
    return part.text;
  }).join("");
}

export function latestComposerProposal(messages: Message[]): ComposerProposal | null {
  for (const message of messages.toReversed()) for (const part of (message.parts ?? []).toReversed()) {
    if (!part || typeof part !== "object" || !("type" in part) || typeof part.type !== "string" || !part.type.startsWith("tool-")
      || !("state" in part) || part.state !== "output-available" || !("output" in part) || !part.output || typeof part.output !== "object"
      || !("status" in part.output) || part.output.status !== "awaiting_confirmation" || !("proposal" in part.output)) continue;
    // The agent can propose any AI-exposed command (ChatCommandProposal in
    // lib/chat/agent.ts), but the Composer only renders and commits record_movement
    // proposals. Anything else throws rather than reaching the commit button.
    const parsed = composerProposal.safeParse(part.output.proposal);
    if (!parsed.success) throw new Error(`Composer proposal could not be shown: ${z.prettifyError(parsed.error)}`);
    return parsed.data;
  }
  return null;
}
