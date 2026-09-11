import type { ComposerProposal } from "@/lib/composer/state";

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
    return part.output.proposal as ComposerProposal;
  }
  return null;
}
