import { expect, it } from "vitest";
import { beginRecovery, finishRecovery, readRecoveries } from "@/lib/commands/recovery";
const context = { actorId: "a", breweryId: "b" };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
it("freezes a committed request across edits and reload, without exposing another tenant's work", () => {
  const disk = storage();
  const first = beginRecovery(disk, context, "/inventory", "record_movement", { qty: 2 });
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", { qty: 3 })).toThrow("Retry saved request");
  const recovered = readRecoveries(disk, context)[0];
  expect(recovered).toEqual(first);
  expect(beginRecovery(disk, context, "/inventory", "record_movement", { qty: 2 })).toEqual(first);
  expect(readRecoveries(disk, { ...context, actorId: "other" })).toEqual([]);
  expect(readRecoveries(disk, { ...context, breweryId: "other" })).toEqual([]);
  expect(readRecoveries(disk, { ...context, customerId: "other" })).toEqual([]);
  finishRecovery(disk, first);
  expect(readRecoveries(disk, context)).toEqual([]);
  expect(beginRecovery(disk, context, "/inventory", "record_movement", { qty: 3 }).requestId).not.toBe(first.requestId);
});
it("refuses to send when durable storage fails", () => {
  const disk = storage();
  disk.setItem = () => { throw new Error("Storage full"); };
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", {})).toThrow("Storage full");
});

it("restores the original CSV manifest and preview row numbers", () => {
  const disk = storage();
  const input = { kind: "opening_balances", rows: [{ qty: "3", binId: "bin" }, { qty: "4", binId: "bin" }] };
  const original = beginRecovery(disk, context, "/settings/import", "import_csv", input, { requestId: "batch-id", previewRows: [2, 5] });
  input.rows[0].qty = "9";
  expect(readRecoveries(disk, context)).toEqual([original]);
  expect(original.input).toEqual({ kind: "opening_balances", rows: [{ qty: "3", binId: "bin" }, { qty: "4", binId: "bin" }] });
  expect(original.previewRows).toEqual([2, 5]);
});

it("scopes an unresolved request to the caller's target: another row proceeds, an edit to the same row waits (#615)", () => {
  const disk = storage();
  const cellA = beginRecovery(disk, context, "/pricing", "set_channel_price", { formatId: "f", unitPriceCents: 100 }, { target: "channel:group-a:f" });
  const cellB = beginRecovery(disk, context, "/pricing", "set_channel_price", { formatId: "f", unitPriceCents: 200 }, { target: "channel:group-b:f" });
  expect(cellB.requestId).not.toBe(cellA.requestId);
  expect(readRecoveries(disk, context)).toEqual([cellA, cellB]);
  expect(cellA.target).toBe("channel:group-a:f");
  expect(() => beginRecovery(disk, context, "/pricing", "set_channel_price", { formatId: "f", unitPriceCents: 150 }, { target: "channel:group-a:f" })).toThrow("Retry saved request");
});

it("keeps a command without a target locked by name, so a changed create cannot duplicate (#615)", () => {
  const disk = storage();
  const first = beginRecovery(disk, context, "/inventory", "record_movement", { skuId: "sku", binId: "bin-a", qty: 2 });
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", { skuId: "sku", binId: "bin-b", qty: 2 })).toThrow("Retry saved request");
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", { skuId: "sku", binId: "bin-b", qty: 2 }, { target: "bin-b" })).not.toThrow();
  expect(readRecoveries(disk, context)[0]).toEqual(first);
});

it("Discard removes the saved request so a changed submit proceeds with a new identity", () => {
  const disk = storage();
  const first = beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 2 });
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 3 })).toThrow("Retry saved request");
  finishRecovery(disk, first);
  expect(beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 3 }).requestId).not.toBe(first.requestId);
});

it("lets an explicit new request id replace the saved attempt for its key: a deliberate new exact attempt (#615)", () => {
  const disk = storage();
  const first = beginRecovery(disk, context, "/settings/pos", "sync_square_catalog", {}, { requestId: "old" });
  expect(beginRecovery(disk, context, "/settings/pos", "sync_square_catalog", {}, { requestId: "old" })).toEqual(first);
  expect(() => beginRecovery(disk, context, "/settings/pos", "sync_square_catalog", { changed: true }, { requestId: "old" })).toThrow("Retry saved request");
  const corrected = beginRecovery(disk, context, "/settings/pos", "sync_square_catalog", { retryConflict: true }, { requestId: "new" });
  expect(corrected.requestId).toBe("new");
  expect(readRecoveries(disk, context)).toEqual([corrected]);
  // Without an explicit id the saved attempt still wins.
  expect(beginRecovery(disk, context, "/settings/pos", "sync_square_catalog", { retryConflict: true }).requestId).toBe("new");
});
