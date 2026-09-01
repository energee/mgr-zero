// tests/chat-adapter-conformance.test.ts — reusable provider-transport
// conformance suite (capabilities, private-destination validation, stable
// refs, idempotent update, retriable-vs-permanent errors) run against
// SlackTransport with a fake provider client. Future adapters reuse `conformance`.
import { describe, expect, it, vi } from "vitest";
import type { ChatProviderTransport } from "@/lib/chat/provider";
import { SlackTransport, classifySlackError, type SlackClientLike, type SlackConversationInfo } from "@/lib/chat/slack-transport";
import { CHAT_PREVIEW_FIXTURES } from "@/lib/chat/preview-fixtures";

const notification = CHAT_PREVIEW_FIXTURES.find((f) => f.id === "personal-dm")!.items[0];

type Fake = { client: SlackClientLike; posts: unknown[]; updates: unknown[]; homes: unknown[]; info: Record<string, SlackConversationInfo> };

function fakeClient(info: Record<string, SlackConversationInfo>): Fake {
  const posts: unknown[] = [], updates: unknown[] = [], homes: unknown[] = [];
  const client: SlackClientLike = {
    conversationsInfo: vi.fn(async (channel: string) => { const i = info[channel]; if (!i) throw Object.assign(new Error("channel_not_found"), { data: { error: "channel_not_found" } }); return i; }),
    postMessage: vi.fn(async (input) => { posts.push(input); return { channel: input.channel, ts: `${posts.length}.000` }; }),
    updateMessage: vi.fn(async (input) => { updates.push(input); }),
    publishHome: vi.fn(async (input) => { homes.push(input); }),
  };
  return { client, posts, updates, homes, info };
}

const PRIVATE: SlackConversationInfo = { is_private: true, is_archived: false, is_member: true, is_shared: false, is_ext_shared: false, is_pending_ext_shared: false };

/** Conformance contract every provider transport must satisfy. */
function conformance(name: string, make: (fake: Fake) => ChatProviderTransport) {
  describe(`${name} transport conformance`, () => {
    it("declares the capability set the plan relies on", () => {
      const t = make(fakeClient({}));
      expect(t.capabilities).toEqual({ personalDelivery: true, persistentHome: true, privateSharedSummary: true, messageUpdate: true, modal: true });
    });

    it("accepts only private, unarchived, bot-joined, non-shared destinations and never falls back", async () => {
      const fake = fakeClient({
        ok: PRIVATE,
        pub: { ...PRIVATE, is_private: false },
        archived: { ...PRIVATE, is_archived: true },
        notMember: { ...PRIVATE, is_member: false },
        shared: { ...PRIVATE, is_shared: true },
        ext: { ...PRIVATE, is_ext_shared: true },
        pending: { ...PRIVATE, is_pending_ext_shared: true },
      });
      const t = make(fake);
      expect(await t.validateDestination({ installationId: "T1", destinationId: "ok" })).toEqual({ ok: true });
      for (const [id, reason] of [["pub", "not_private"], ["archived", "archived"], ["notMember", "bot_not_member"], ["shared", "shared"], ["ext", "externally_shared"], ["pending", "externally_shared"], ["missing", "channel_not_found"]]) {
        expect(await t.validateDestination({ installationId: "T1", destinationId: id })).toEqual({ ok: false, reason });
      }
    });

    it("returns a stable message reference and updates in place without a second post", async () => {
      const fake = fakeClient({ D1: PRIVATE });
      const t = make(fake);
      const ref = await t.send({ installationId: "T1", destinationId: "D1", notification, intentId: "i-1" });
      expect(ref).toEqual({ conversationId: "D1", messageId: "1.000" });
      await t.update({ installationId: "T1", ref, notification, intentId: "i-1", resolved: true });
      await t.update({ installationId: "T1", ref, notification, intentId: "i-1", resolved: true });
      expect(fake.posts.length).toBe(1);
      expect(fake.updates.length).toBe(2);
      expect((fake.updates[0] as { ts: string }).ts).toBe("1.000");
      expect(JSON.stringify(fake.updates[0])).not.toContain("actions");
    });

    it("publishes App Home for one external user only", async () => {
      const fake = fakeClient({});
      const t = make(fake);
      await t.publishHome({ installationId: "T1", externalUserId: "U9", items: [notification] });
      expect(fake.homes.length).toBe(1);
      expect((fake.homes[0] as { userId: string }).userId).toBe("U9");
    });
  });
}

conformance("Slack", (fake) => new SlackTransport(() => fake.client, { mgrBaseUrl: "https://mgr.test" }));

describe("Slack error classification", () => {
  it("retries rate limits and transient failures with the provider delay, and stops on permanent auth/destination errors", () => {
    expect(classifySlackError(Object.assign(new Error("ratelimited"), { data: { error: "ratelimited" }, retryAfter: 7 }))).toEqual({ retryable: true, code: "ratelimited", retryAfterMs: 7000 });
    expect(classifySlackError(Object.assign(new Error("x"), { data: { error: "internal_error" } }))).toMatchObject({ retryable: true, code: "internal_error" });
    expect(classifySlackError(new Error("ECONNRESET"))).toMatchObject({ retryable: true, code: "network" });
    for (const code of ["invalid_auth", "account_inactive", "token_revoked", "channel_not_found", "not_in_channel", "is_archived", "user_not_found"]) {
      expect(classifySlackError(Object.assign(new Error(code), { data: { error: code } }))).toEqual({ retryable: false, code });
    }
  });
});
