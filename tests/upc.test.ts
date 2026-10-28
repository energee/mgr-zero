// tests/upc.test.ts — one UPC rule (#1498): lib/mgr/upc.ts backs the Edit SKU and
// Save UPC sheets and the create_sku / update_sku / set_price_group_barcode
// schemas, so a form and an HTTP caller get the same full-sentence message.
// Pure: parses the registered input schemas, no database.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/catalog";
import { UPC_MESSAGE, upcError } from "@/lib/mgr/upc";

const SKU = "00000000-0000-4000-8000-000000000001";

describe("upcError", () => {
  it.each(["abc", "123", "1234567", "123456789", "123456789012345", "1234 5678"])("refuses %s", value => {
    expect(upcError(value)).toBe(UPC_MESSAGE);
  });
  it.each(["", "  ", "12345678", "123456789012", "1234567890123", "12345678901234", " 12345678 "])("accepts %j", value => {
    expect(upcError(value)).toBeUndefined();
  });
});

describe("UPC command schemas", () => {
  const issues = (name: string, input: object) => {
    const parsed = getCommandDefinition(name)!.input.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map(issue => issue.message);
  };
  it("refuses a bad UPC with the helper's sentence", () => {
    expect(issues("update_sku", { skuId: SKU, active: true, upc: "abc" })).toEqual([UPC_MESSAGE]);
    expect(issues("create_sku", { brandId: SKU, formatId: SKU, upc: "123" })).toEqual([UPC_MESSAGE]);
    expect(issues("set_price_group_barcode", { priceGroupId: SKU, formatId: SKU, upc: "abc" })).toEqual([UPC_MESSAGE]);
  });
  it("accepts a valid or blank UPC", () => {
    expect(issues("update_sku", { skuId: SKU, active: true, upc: "12345678" })).toEqual([]);
    expect(issues("update_sku", { skuId: SKU, active: true, upc: "" })).toEqual([]);
    expect(issues("set_price_group_barcode", { priceGroupId: SKU, formatId: SKU, upc: null })).toEqual([]);
  });
});
