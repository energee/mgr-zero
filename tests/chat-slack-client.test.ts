// tests/chat-slack-client.test.ts — the production Slack client returns
// control to the delivery worker inside its lease (#1247). The real adapter
// (lib/chat/slack-adapter.ts) talks to a fake Slack API on 127.0.0.1 through
// SLACK_API_URL; no request leaves the machine and no database is touched.
// A 429 must reach the worker as a rate-limit error at once, a hung request
// must be abandoned before the 5 s lease margin, and the worker must turn the
// 429 into a retry at Slack's Retry-After.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runChatDeliveryBatch, type DeliveryContext } from "@/lib/chat/jobs";
import { slackAdapter } from "@/lib/chat/slack-adapter";
import { SlackTransport, classifySlackError, type SlackClientLike } from "@/lib/chat/slack-transport";

const TOKEN = "xoxb-test";
let hits = 0;
let behave: (hit: number, res: http.ServerResponse) => void = () => {};
const server = http.createServer((req, res) => { req.resume(); req.on("end", () => behave(++hits, res)); });
const ok = (res: http.ServerResponse) =>
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, channel: "D1", ts: "1.1" }));
// First request is throttled for 2 s; a client that waits it out then succeeds.
const throttledOnce = (hit: number, res: http.ServerResponse) => (hit === 1 ? res.writeHead(429, { "retry-after": "2" }).end() : ok(res));

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("SLACK_API_URL", `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`);
  vi.stubEnv("SLACK_CLIENT_ID", "id");
  vi.stubEnv("SLACK_CLIENT_SECRET", "secret");
  vi.stubEnv("SLACK_SIGNING_SECRET", "signing");
  vi.stubEnv("CHAT_SDK_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
});
afterAll(() => { server.closeAllConnections(); server.close(); vi.unstubAllEnvs(); });

// As slackClientFor calls it: the bot token bound, then passed on the call.
const postMessage = (channel: string, text: string, blocks?: unknown[]) => {
  const slack = slackAdapter();
  return slack.withBotToken(TOKEN, () => slack.client.chat.postMessage({ token: TOKEN, channel, text, blocks: blocks as never }));
};
const post = () => postMessage("D1", "x");

// Settles `call`, or reports it still pending after `capMs`.
async function settle(call: () => Promise<unknown>, capMs: number) {
  hits = 0;
  const started = Date.now();
  const outcome = await Promise.race([
    call().then(() => ({ settled: "resolved", error: undefined }), (error: unknown) => ({ settled: "rejected", error })),
    new Promise<{ settled: string; error: unknown }>((resolve) => setTimeout(() => resolve({ settled: "pending", error: undefined }), capMs)),
  ]);
  return { ...outcome, ms: Date.now() - started, requests: hits };
}

describe("production Slack client", () => {
  it("surfaces a 429 as a rate-limit error at once, without waiting out Retry-After", async () => {
    behave = throttledOnce;
    const r = await settle(post, 10_000);
    expect(r.settled).toBe("rejected");
    expect(r.requests).toBe(1);
    expect(r.ms).toBeLessThan(1_000);
    expect(classifySlackError(r.error)).toEqual({ retryable: true, code: "ratelimited", retryAfterMs: 2_000 });
  });

  it("abandons a hung request inside the lease margin", async () => {
    behave = () => {}; // hold the socket open
    // LEASE_SAFETY_MS (lib/chat/jobs.ts) is 5 s, and up to 1 s of it goes to pacing.
    const r = await settle(post, 5_000);
    expect(r.settled).toBe("rejected");
    expect(r.requests).toBe(1);
    expect(r.ms).toBeLessThan(4_000);
    expect(classifySlackError(r.error)).toEqual({ retryable: true, code: "network" });
  });
});

describe("delivery worker over the production Slack client", () => {
  // The SlackClientLike slackClientFor builds, minus its installation lookup
  // (which needs the database).
  const client: SlackClientLike = {
    conversationsInfo: async () => { throw new Error("unexpected conversations.info"); },
    postMessage: async ({ channel, text, blocks }) => {
      const r = await postMessage(channel, text, blocks);
      return { channel: r.channel ?? channel, ts: r.ts ?? "" };
    },
    updateMessage: async () => { throw new Error("unexpected chat.update"); },
    publishHome: async () => { throw new Error("unexpected views.publish"); },
  };

  it("records a Slack 429 as a retry at Retry-After, not a send", async () => {
    const now = new Date();
    const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
    const context: DeliveryContext = {
      delivery: { id: "d1", state: "leased", attempt_count: 1, provider_conversation_id: null, provider_message_id: null, resolved_at: null },
      occurrence: {
        id: "o1", reason: "submitted_order", state: "active", subject_type: "order", subject_id: "order-1",
        urgency: "normal", due_at: null, semantic_key: "submitted:1",
        payload: { safe_label: "Order", detail: "Submitted", href: "/orders", recipient_roles: ["sales"], assigned_user_id: null },
      },
      destination: { id: "dest-1", kind: "personal", external_destination_id: "D-1247", state: "active", user_id: "u1" },
      installation: { id: "inst", state: "active", external_installation_id: "T1247", provider: "slack", brewery_id: "b1" },
      link_active: true, source_current: true, recipient_eligible: true, external_user_id: "U1",
      preference_enabled: true, counts: null, quiet_release_at: null,
    };
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcs.push({ fn, args });
        if (fn === "lease_chat_deliveries") {
          return { data: [{ id: "d1", occurrence_id: "o1", destination_id: "dest-1", installation_id: "inst", provider: "slack",
            lease_expires_at: new Date(now.getTime() + 60_000).toISOString(), attempt_count: 1 }], error: null };
        }
        if (fn === "get_chat_delivery_context") return { data: context, error: null };
        return { data: null, error: null }; // action intents, and the outcome writes recorded above
      },
    } as unknown as NonNullable<Parameters<typeof runChatDeliveryBatch>[0]>["db"];
    behave = throttledOnce;
    hits = 0;

    const result = await runChatDeliveryBatch({ now, db, transport: new SlackTransport(() => client, { mgrBaseUrl: "https://mgr.test" }) });

    expect(hits).toBe(1);
    expect(result).toMatchObject({ sent: 0, retried: 1 });
    expect(rpcs.find((r) => r.fn === "complete_chat_delivery")).toBeUndefined();
    expect(rpcs.find((r) => r.fn === "retry_chat_delivery")?.args).toMatchObject({
      p_delivery: "d1", p_error_code: "ratelimited", p_next_attempt_at: new Date(now.getTime() + 2_000).toISOString(),
    });
  });
});
