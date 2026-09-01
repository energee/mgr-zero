// lib/chat/slack-transport.ts — Slack implementation of ChatProviderTransport
// over a minimal client interface (SlackClientLike) so the conformance suite
// runs against a fake; production wires it to the Chat SDK adapter's
// token-scoped WebClient (slack-adapter.ts). Destination validation fails
// closed: a channel that is not private, is archived, lacks the bot, or is
// shared/external is rejected with a reason and never replaced by a fallback.
import type { ChatCapabilitySet, PortableNotification } from "./contracts";
import type { ChatProviderTransport, DestinationCheck, ProviderErrorClass, ProviderMessageRef } from "./provider";
import { renderSlackHome, renderSlackMessage } from "./slack-renderer";

export type SlackConversationInfo = {
  is_private: boolean; is_archived: boolean; is_member: boolean;
  is_shared: boolean; is_ext_shared: boolean; is_pending_ext_shared: boolean;
};

export interface SlackClientLike {
  conversationsInfo(channel: string): Promise<SlackConversationInfo>;
  postMessage(input: { channel: string; text: string; blocks: unknown[] }): Promise<{ channel: string; ts: string }>;
  updateMessage(input: { channel: string; ts: string; text: string; blocks: unknown[] }): Promise<void>;
  publishHome(input: { userId: string; view: unknown }): Promise<void>;
}

export const SLACK_CAPABILITIES: ChatCapabilitySet = {
  personalDelivery: true, persistentHome: true, privateSharedSummary: true, messageUpdate: true, modal: true,
};

const PERMANENT = new Set([
  "invalid_auth", "account_inactive", "token_revoked", "token_expired", "not_authed", "missing_scope",
  "channel_not_found", "not_in_channel", "is_archived", "user_not_found", "users_not_found", "cannot_dm_bot",
  "message_not_found", "cant_update_message", "invalid_blocks", "invalid_arguments",
]);

/** Slack WebClient errors carry `data.error`; rate limits carry `retryAfter` seconds. */
export function classifySlackError(err: unknown): ProviderErrorClass {
  const e = err as { data?: { error?: string }; retryAfter?: number; code?: string; message?: string };
  const code = e?.data?.error ?? (e?.code === "slack_webapi_rate_limited_error" ? "ratelimited" : undefined);
  if (code === "ratelimited") return { retryable: true, code, retryAfterMs: Math.max(1, e.retryAfter ?? 30) * 1000 };
  if (code && PERMANENT.has(code)) return { retryable: false, code };
  if (code) return { retryable: true, code };
  return { retryable: true, code: "network" };
}

export class SlackTransport implements ChatProviderTransport {
  readonly provider = "slack" as const;
  readonly capabilities = SLACK_CAPABILITIES;
  constructor(private readonly clientFor: (installationId: string) => SlackClientLike, private readonly o: { mgrBaseUrl: string }) {}

  async validateDestination({ installationId, destinationId }: { installationId: string; destinationId: string }): Promise<DestinationCheck> {
    let info: SlackConversationInfo;
    try {
      info = await this.clientFor(installationId).conversationsInfo(destinationId);
    } catch (err) {
      return { ok: false, reason: classifySlackError(err).code };
    }
    if (!info.is_private) return { ok: false, reason: "not_private" };
    if (info.is_archived) return { ok: false, reason: "archived" };
    if (!info.is_member) return { ok: false, reason: "bot_not_member" };
    if (info.is_ext_shared || info.is_pending_ext_shared) return { ok: false, reason: "externally_shared" };
    if (info.is_shared) return { ok: false, reason: "shared" };
    return { ok: true };
  }

  async send({ installationId, destinationId, notification, intentId }: { installationId: string; destinationId: string; notification: PortableNotification; intentId: string }): Promise<ProviderMessageRef> {
    const { text, blocks } = renderSlackMessage(notification, { mgrBaseUrl: this.o.mgrBaseUrl, intentId });
    const r = await this.clientFor(installationId).postMessage({ channel: destinationId, text, blocks });
    return { conversationId: r.channel, messageId: r.ts };
  }

  async update({ installationId, ref, notification, intentId, resolved }: { installationId: string; ref: ProviderMessageRef; notification: PortableNotification; intentId: string; resolved?: boolean }): Promise<void> {
    const { text, blocks } = renderSlackMessage(notification, { mgrBaseUrl: this.o.mgrBaseUrl, intentId, resolved });
    await this.clientFor(installationId).updateMessage({ channel: ref.conversationId, ts: ref.messageId, text, blocks });
  }

  async publishHome({ installationId, externalUserId, items, linkUrl }: { installationId: string; externalUserId: string; items: readonly PortableNotification[]; linkUrl?: string }): Promise<void> {
    const view = linkUrl
      ? renderSlackHome({ linked: false, linkUrl, mgrBaseUrl: this.o.mgrBaseUrl })
      : renderSlackHome({ linked: true, items, mgrBaseUrl: this.o.mgrBaseUrl });
    await this.clientFor(installationId).publishHome({ userId: externalUserId, view });
  }
}
