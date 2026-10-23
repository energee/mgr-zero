// tests/chat-delivery-lease.test.ts — the delivery batch stops once its lease
// is spent (#1158). Pure: a fake clock, a fake RPC client and a fake
// transport, so it needs no database. Once a lease lapses, the next lease call
// hands the row to another worker, so a send after that point posts twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatProviderTransport } from "@/lib/chat/provider";
import { SLACK_CAPABILITIES } from "@/lib/chat/slack-transport";
import { runChatDeliveryBatch, type DeliveryContext } from "@/lib/chat/jobs";

const START = Date.parse("2036-09-05T14:00:00Z");
const LEASE_EXPIRES = new Date(START + 60_000).toISOString();

// Each row posts to its own destination, `C-<id>`. `paced` remembers the last
// send per destination for the whole file, so a reused id would make it wait.
const context = (id: string, existing: boolean): DeliveryContext => ({
  delivery: {
    id, state: "leased", attempt_count: 1, resolved_at: null,
    provider_conversation_id: existing ? `C-${id}` : null, provider_message_id: existing ? `m-${id}` : null,
  },
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

// Leases `ids` (all with one expiry, as the real RPC does) and answers only
// the RPCs a channel send reaches; anything else fails the test. Rows in
// `existing` already have a provider message, so they take the update path.
function fakeDb(ids: string[], seen: { fetched: string[]; recorded: string[] }, existing: string[] = []) {
  const rpc = async (fn: string, args: { p_delivery?: string }) => {
    if (fn === "lease_chat_deliveries") {
      return { data: ids.map((id) => ({ id, occurrence_id: `o-${id}`, destination_id: `dest-${id}`, installation_id: "inst", provider: "slack", lease_expires_at: LEASE_EXPIRES, attempt_count: 1 })), error: null };
    }
    if (fn === "get_chat_delivery_context") {
      seen.fetched.push(args.p_delivery!);
      return { data: context(args.p_delivery!, existing.includes(args.p_delivery!)), error: null };
    }
    if (fn === "complete_chat_delivery") { seen.recorded.push(args.p_delivery!); return { data: null, error: null }; }
    throw new Error(`unexpected rpc ${fn}`);
  };
  return { rpc } as unknown as NonNullable<Parameters<typeof runChatDeliveryBatch>[0]>["db"];
}

// Advances the fake clock by `validateMs` per destination check and `sendMs`
// per send or update, and records which deliveries were sent or updated.
function slowTransport({ validateMs = 0, sendMs = 0 }, calls: { sent: string[]; updated: string[] }): ChatProviderTransport {
  return {
    provider: "slack", capabilities: SLACK_CAPABILITIES,
    validateDestination: async () => {
      vi.setSystemTime(Date.now() + validateMs);
      return { ok: true };
    },
    send: async (i) => {
      calls.sent.push(i.intentId);
      vi.setSystemTime(Date.now() + sendMs);
      return { conversationId: i.destinationId, messageId: `m-${i.intentId}` };
    },
    update: async (i) => {
      calls.updated.push(i.intentId);
      vi.setSystemTime(Date.now() + sendMs);
    },
    publishHome: async () => { throw new Error("unexpected publish"); },
  };
}

async function run(ids: string[], timing: { validateMs?: number; sendMs?: number }, existing: string[] = []) {
  const seen = { fetched: [] as string[], recorded: [] as string[] };
  const calls = { sent: [] as string[], updated: [] as string[] };
  const result = await runChatDeliveryBatch({ limit: 50, now: new Date(START), db: fakeDb(ids, seen, existing), transport: slowTransport(timing, calls) });
  return { result, ...seen, ...calls };
}

describe("chat delivery lease", () => {
  // Only Date is faked: real timers keep `paced` from hanging if it ever waits.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("stops before a row with under five seconds of lease left", async () => {
    // Sends start at 0s and 28s. At 56s only 4s of the 60s lease is left.
    const r = await run(["a1", "a2", "a3", "a4"], { sendMs: 28_000 });
    expect(r.sent).toEqual(["a1", "a2"]);
    expect(r.recorded).toEqual(["a1", "a2"]);
    expect(r.result).toMatchObject({ sent: 2, expired: 2, retried: 0, terminal: 0 });
  });

  it("stops once the lease has lapsed, without touching the remaining rows", async () => {
    // Sends start at 0s and 35s. At 70s the lease lapsed 10s ago.
    const r = await run(["b1", "b2", "b3", "b4"], { sendMs: 35_000 });
    expect(r.sent).toEqual(["b1", "b2"]);
    expect(r.recorded).toEqual(["b1", "b2"]);
    expect(r.fetched).toEqual(["b1", "b2"]);
    expect(r.result).toMatchObject({ sent: 2, expired: 2, retried: 0, terminal: 0 });
  });

  it("does not update an existing message once the destination check spent the lease", async () => {
    // The check passes the top-of-row lease test at 0s and finishes at 58s.
    const r = await run(["c1", "c2"], { validateMs: 58_000 }, ["c1"]);
    expect(r.updated).toEqual([]);
    expect(r.sent).toEqual([]);
    expect(r.recorded).toEqual([]);
    expect(r.fetched).toEqual(["c1"]);
    expect(r.result).toMatchObject({ updated: 0, sent: 0, expired: 2 });
  });
});
