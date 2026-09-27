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
  const original = beginRecovery(disk, context, "/settings/import", "import_csv", input, "batch-id", [2, 5]);
  input.rows[0].qty = "9";
  expect(readRecoveries(disk, context)).toEqual([original]);
  expect(original.input).toEqual({ kind: "opening_balances", rows: [{ qty: "3", binId: "bin" }, { qty: "4", binId: "bin" }] });
  expect(original.previewRows).toEqual([2, 5]);
});
