import { describe, expect, it } from "vitest";
import { cartLines, reconcilePortalOrder, restorePortalAttempt, storePortalAttempt, portalAttemptKey } from "@/lib/portal-cart";
const id = "11111111-1111-4111-8111-111111111111";
const scope = { actorId: id, customerId: id, breweryId: id };
const fields = { shipToId: id, poNumber: "", note: "", requestedShipDate: null, lines: [{ skuId: id, qty: 2 }] };
const attempt = { scope, requestId: id, command: "portal_create_order", input: { ...fields, expectedIdentity: { actorId: id, customerId: id } }, purpose: "submit", fields };
describe("portal continuity", () => {
  it("rejects invalid quantities instead of silently dropping them", () => {
    expect(cartLines({ [id]: "2" })).toEqual([{ skuId: id, qty: 2 }]);
    for (const qty of ["-1", "1.5", "Infinity", "bad"]) expect(cartLines({ [id]: qty })).toBeNull();
    expect(cartLines({ [id]: "" })).toEqual([]);
  });
  it("reconciles eligible lines at current prices and preserves explicit ship-to without copying old PO/date into reorder", () => {
    const saved = { order: { id, status: "draft", ship_to_id: id, po_number: "old", note: "old note", requested_ship_date: "2020-01-01" }, lines: [{ sku_id: id, qty_ordered: 2 }, { sku_id: "removed", qty_ordered: 3 }] };
    const got = reconcilePortalOrder(saved, [{ skuId: id }], [{ id }], true);
    expect(got.fields).toEqual(fields);
    expect(got.removed).toHaveLength(1);
    expect(got.draftId).toBeNull();
    expect(reconcilePortalOrder(saved, [{ skuId: id }], [{ id }], false).fields.poNumber).toBe("old");
    expect(() => reconcilePortalOrder({ ...saved, order: { ...saved.order, status: "submitted" } }, [], [], false)).toThrow(/draft/);
  });
  it("restores only a validated exact attempt in the same actor/customer/brewery scope", () => {
    expect(restorePortalAttempt(JSON.stringify(attempt), scope)).toEqual(attempt);
    expect(() => restorePortalAttempt(JSON.stringify(attempt), { ...scope, actorId: "other" })).toThrow();
    expect(() => restorePortalAttempt(JSON.stringify({ ...attempt, command: "ship_order" }), scope)).toThrow();
    expect(() => restorePortalAttempt("broken", scope)).toThrow();
    expect(portalAttemptKey(scope)).not.toBe(portalAttemptKey({ ...scope, customerId: "other" }));
  });
  it("does not allow sending when recovery storage fails", () => {
    expect(() => storePortalAttempt({ setItem() { throw new Error("quota"); } }, attempt as never)).toThrow(/recovery/);
  });
});

import { executePortalAttempt } from "@/lib/portal-cart";
it("reload retries the persisted submit directly after a lost response", async () => {
  let raw: string | null = null;
  const storage = { setItem(_key: string, value: string) { raw = value; }, removeItem() { raw = null; } };
  const sent: { name: string; requestId: string }[] = [];
  const send = async (_b: string, name: string, _i: unknown, requestId: string) => {
    expect(raw).not.toBeNull();
    sent.push({ name, requestId });
    if (name === "portal_submit_order") throw new Error("response lost");
    return { order_id: id };
  };
  await expect(executePortalAttempt(attempt as never, storage, send, () => {})).rejects.toThrow("response lost");
  const restored = restorePortalAttempt(raw, scope)!;
  expect(restored.command).toBe("portal_submit_order");
  await executePortalAttempt(restored, storage, async (_b, name, _i, requestId) => { sent.push({ name, requestId }); return { order_id: id }; }, () => {});
  expect(sent.map(s => s.name)).toEqual(["portal_create_order", "portal_submit_order", "portal_submit_order"]);
  expect(sent[1].requestId).toBe(sent[2].requestId);
  expect(raw).toBeNull();
});
it("reload retries the identical create and never sends when persistence fails", async () => {
  let raw: string | null = null;
  const storage = { setItem(_key: string, value: string) { raw = value; }, removeItem() { raw = null; } };
  await expect(executePortalAttempt(attempt as never, storage, async () => { throw new Error("lost"); }, () => {})).rejects.toThrow("lost");
  expect(restorePortalAttempt(raw, scope)).toEqual(attempt);
  let sent = false;
  await expect(executePortalAttempt(attempt as never, { ...storage, setItem() { throw new Error("quota"); } }, async () => { sent = true; }, () => {})).rejects.toThrow(/recovery/);
  expect(sent).toBe(false);
});
import { canRetirePortalFailure } from "@/lib/portal-cart";
it("keeps identity when an uncertain create retry is rate-limited or loses access", () => {
  for (const status of [400, 403, 408, 429, 500]) expect(canRetirePortalFailure(status, true)).toBe(false);
  for (const status of [401, 408, 429, 500]) expect(canRetirePortalFailure(status, false)).toBe(false);
  expect(canRetirePortalFailure(409, false, "context_changed")).toBe(false);
  expect(canRetirePortalFailure(409, false, "conflict")).toBe(true);
  expect(canRetirePortalFailure(400, false)).toBe(true);
});
it("restores an exact quoted submit without rebuilding the reviewed fields", () => {
  const quoted = { ...attempt, command: "portal_submit_quote", input: { quoteId: id, expectedIdentity: { actorId: id, customerId: id } } };
  expect(restorePortalAttempt(JSON.stringify(quoted), scope)).toEqual(quoted);
  expect(() => restorePortalAttempt(JSON.stringify({ ...quoted, input: { ...quoted.input, quoteId: "other" } }), scope)).toThrow();
});
it("keeps the create recovery when saving the next submit stage fails", async () => {
  let raw: string | null = null;
  let writes = 0;
  const sent: string[] = [];
  await expect(executePortalAttempt(attempt as never, {
    setItem(_key, value) { if (++writes === 2) throw new Error("quota"); raw = value; },
    removeItem() { raw = null; },
  }, async (_b, name) => { sent.push(name); return { order_id: id }; }, () => {})).rejects.toThrow(/recovery/);
  expect(sent).toEqual(["portal_create_order"]);
  expect(restorePortalAttempt(raw, scope)?.requestId).toBe(id);
  for (const key of ["actorId", "customerId", "breweryId"] as const) {
    expect(() => restorePortalAttempt(raw, { ...scope, [key]: "22222222-2222-4222-8222-222222222222" })).toThrow();
  }
});

import { cartActionsDisabled } from "@/lib/portal-cart";
it("disables fresh actions without an explicit fulfillment source", () => {
  expect(cartActionsDisabled({ hasSource: false, busy: false, shipToId: id, lineCount: 1 })).toBe(true);
  expect(cartActionsDisabled({ hasSource: true, busy: false, shipToId: id, lineCount: 1 })).toBe(false);
  expect(cartActionsDisabled({ hasSource: true, busy: true, shipToId: id, lineCount: 1 })).toBe(true);
});
