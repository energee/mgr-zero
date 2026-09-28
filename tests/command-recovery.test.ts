import { expect, it } from "vitest";
import { beginRecovery, finishRecovery, readRecoveries, recoveryKey } from "@/lib/commands/recovery";
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
  const original = beginRecovery(disk, context, "/settings/import", "import_csv", input, "batch-id", [2, 5]);
  input.rows[0].qty = "9";
  expect(readRecoveries(disk, context)).toEqual([original]);
  expect(original.input).toEqual({ kind: "opening_balances", rows: [{ qty: "3", binId: "bin" }, { qty: "4", binId: "bin" }] });
  expect(original.previewRows).toEqual([2, 5]);
});

it("scopes an unresolved request to its record: another record proceeds, an edit to the same record waits (#615)", () => {
  const disk = storage();
  const cellA = beginRecovery(disk, context, "/pricing", "set_channel_price", { channelId: "c", skuId: "a", priceCents: 100 });
  const cellB = beginRecovery(disk, context, "/pricing", "set_channel_price", { skuId: "b", channelId: "c", priceCents: 200 });
  expect(cellB.requestId).not.toBe(cellA.requestId);
  expect(readRecoveries(disk, context)).toEqual([cellA, cellB]);
  expect(() => beginRecovery(disk, context, "/pricing", "set_channel_price", { channelId: "c", skuId: "a", priceCents: 150 })).toThrow("Retry saved request");
  const brand = beginRecovery(disk, context, "/brands", "upsert_brand", { id: "brand-a", name: "Hazy" });
  expect(() => beginRecovery(disk, context, "/brands", "upsert_brand", { id: "brand-a", name: "Hazier" })).toThrow("Retry saved request");
  expect(beginRecovery(disk, context, "/brands", "upsert_brand", { id: "brand-b", name: "Stout" }).requestId).not.toBe(brand.requestId);
});

it("keys a saved request by its command and id fields, ignoring key order and non-id fields", () => {
  expect(recoveryKey("delete_bin", { binId: "x", note: "a" })).toBe(recoveryKey("delete_bin", { note: "b", binId: "x" }));
  expect(recoveryKey("move", { toBinId: "t", fromBinId: "f", skuIds: ["s"] })).toBe(recoveryKey("move", { skuIds: ["s"], fromBinId: "f", toBinId: "t" }));
  expect(recoveryKey("delete_bin", { binId: "x" })).not.toBe(recoveryKey("delete_bin", { binId: "y" }));
  expect(recoveryKey("delete_bin", { binId: "x" })).not.toBe(recoveryKey("delete_location", { binId: "x" }));
  expect(recoveryKey("sync_square_catalog", {})).toBe(recoveryKey("sync_square_catalog", undefined));
});

it("Discard removes the saved request so a changed submit proceeds with a new identity", () => {
  const disk = storage();
  const first = beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 2 });
  expect(() => beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 3 })).toThrow("Retry saved request");
  finishRecovery(disk, first);
  expect(beginRecovery(disk, context, "/inventory", "record_movement", { binId: "bin", qty: 3 }).requestId).not.toBe(first.requestId);
});
