// lib/chat/provider.ts — provider transport contract used by delivery jobs and
// the adapter conformance suite. Every provider (Slack today) implements it
// over its own client; MGR code above this line never imports a provider SDK.
import type { ChatCapabilitySet, PortableNotification } from "./contracts";

export type ProviderMessageRef = { conversationId: string; messageId: string };

export type DestinationCheck = { ok: true } | { ok: false; reason: string };

export interface ChatProviderTransport {
  readonly provider: "slack";
  readonly capabilities: ChatCapabilitySet;
  validateDestination(input: { installationId: string; destinationId: string }): Promise<DestinationCheck>;
  send(input: { installationId: string; destinationId: string; notification: PortableNotification; intentId: string }): Promise<ProviderMessageRef>;
  update(input: { installationId: string; ref: ProviderMessageRef; notification: PortableNotification; intentId: string; resolved?: boolean }): Promise<void>;
  publishHome(input: { installationId: string; externalUserId: string; items: readonly PortableNotification[]; linkUrl?: string }): Promise<void>;
}

/** Classified provider failure: retryable (with optional provider delay) or permanent. */
export type ProviderErrorClass = { retryable: true; code: string; retryAfterMs?: number } | { retryable: false; code: string };
