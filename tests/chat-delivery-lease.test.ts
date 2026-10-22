// tests/chat-delivery-lease.test.ts — the delivery batch stops sending once its
// lease is spent (#1158). Pure: a fake clock, a fake RPC client and a fake
// transport, so it needs no database. Once a lease lapses, the next lease call
// hands the row to another worker, so a send after that point posts twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatProviderTransport } from "@/lib/chat/provider";
import { SLACK_CAPABILITIES } from "@/lib/chat/slack-transport";
import { runChatDeliveryBatch, type DeliveryContext } from "@/lib/chat/jobs";

const START = Date.parse("2036-09-05T14:00:00Z");
const LEASE_EXPIRES = new Date(START + 60_000).toISOString();
const ids = ["d1", "d2", "d3", "d4"];

const context = (id: string): DeliveryContext => ({
  delivery: { id, state: "leased", attempt_count: 1, provider_conversation_id: null, provider_message_id: null, resolved_at: null },
  occurrence: {
    id: `o-${id}`, reason: "submitted_order", state: "active", subject_type: "order", subject_id: `order-${id}`,
    urgency: "normal", due_at: null, semantic_key: `submitted:${id}`,
    payload: { safe_label: "Order", detail: "Submitted", href: "/orders", recipient_roles: ["sales"], assigned_user_id: null },
  },
  destination: { id: `dest-${id}`, kind: "private_channel", external_destination_id: `C-${id}`, state: "active", user_id: null },
  installation: { id: "inst", state: "active", external_installation_id: "T1", provider: "slack", brewery_id: "b1" },
  link_active: true, source_current: true, recipient_eligible: true, external_user_id: null,
  preference_enabled: true, counts: null, quiet_release_at: null,
});

// Answers only the RPCs a plain channel send reaches; anything else fails the test.
function fakeDb(recorded: string[]) {
  const rpc = async (fn: string, args: { p_delivery?: string }) => {
    if (fn === "lease_chat_deliveries") {
      return { data: ids.map((id) => ({ id, occurrence_id: `o-${id}`, destination_id: `dest-${id}`, installation_id: "inst", provider: "slack", lease_expires_at: LEASE_EXPIRES, attempt_count: 1 })), error: null };
    }
    if (fn === "get_chat_delivery_context") return { data: context(args.p_delivery!), error: null };
    if (fn === "complete_chat_delivery") { recorded.push(args.p_delivery!); return { data: null, error: null }; }
    throw new Error(`unexpected rpc ${fn}`);
  };
  return { rpc } as unknown as NonNullable<Parameters<typeof runChatDeliveryBatch>[0]>["db"];
}

// Each provider call takes 28 seconds of clock time.
function slowTransport(sent: string[]): ChatProviderTransport {
  return {
    provider: "slack", capabilities: SLACK_CAPABILITIES,
    validateDestination: async () => ({ ok: true }),
    send: async (i) => {
      sent.push(i.intentId);
      vi.setSystemTime(Date.now() + 28_000);
      return { conversationId: i.destinationId, messageId: `m-${i.intentId}` };
    },
    update: async () => { throw new Error("unexpected update"); },
    publishHome: async () => { throw new Error("unexpected publish"); },
  };
}

describe("chat delivery lease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("does not send a row whose lease has lapsed or is about to, and leaves it unrecorded", async () => {
    const sent: string[] = [], recorded: string[] = [];
    const result = await runChatDeliveryBatch({ limit: 50, now: new Date(START), db: fakeDb(recorded), transport: slowTransport(sent) });
    // Sends start at 0s and 28s. At 56s only 4s of the 60s lease is left,
    // inside the safety margin, so d3 and d4 wait for the lease to lapse.
    expect(sent).toEqual(["d1", "d2"]);
    expect(recorded).toEqual(["d1", "d2"]);
    expect(result).toMatchObject({ sent: 2, expired: 2, retried: 0, terminal: 0 });
  });
});
