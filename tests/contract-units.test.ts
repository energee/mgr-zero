// tests/contract-units.test.ts — #465: contract balances (received, on order,
// available) are in PURCHASE units, so the Contract sheet must label them with
// the material's purchase unit, never its base unit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contractBalanceFields } from "../lib/mgr/contract-view";

describe("contract balance labels (#465)", () => {
  it("labels received / on order / available with the purchase unit", () => {
    expect(contractBalanceFields({ qty_received: 10, qty_on_order: 5, qty_available: 25, purchase_uom: "bag" })).toEqual({
      received: "10 bag · read-only",
      onOrder: "5 bag · read-only",
      available: "25 bag",
    });
  });

  it("leaves fields blank for a new contract and omits a missing unit", () => {
    expect(contractBalanceFields(undefined)).toEqual({ received: "", onOrder: "", available: "" });
    expect(contractBalanceFields({ qty_received: 3, qty_on_order: 0, qty_available: 7 })).toEqual({
      received: "3 · read-only", onOrder: "0 · read-only", available: "7",
    });
  });

  it("the Vendors page attaches the material's purchase unit, not its base unit", () => {
    const page = readFileSync("app/(app)/vendors/page.tsx", "utf8");
    expect(page).toMatch(/purchase_uom:\s*materials\.find\(/);
    expect(page).not.toMatch(/base_uom:\s*materials\.find\(/);
  });
});
