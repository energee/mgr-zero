// tests/contract-units.test.ts — #465: contract balances (received, on order,
// available) are in PURCHASE units, so the Contract sheet must label them with
// the material's purchase unit, never its base unit. #1494: an end date
// before the start date is refused in the sheet and by the command.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contractBalanceFields, contractDateError, contractSubmitReason, initialContractVendor } from "../lib/mgr/contract-view";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

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

describe("contract vendor default", () => {
  it("selects a vendor only when a new contract has exactly one choice", () => {
    expect(initialContractVendor(undefined, [])).toBe("");
    expect(initialContractVendor(undefined, [{ id: "only" }])).toBe("only");
    expect(initialContractVendor(undefined, [{ id: "first" }, { id: "second" }])).toBe("");
  });

  it("keeps an edited contract's vendor even when the available options differ", () => {
    expect(initialContractVendor({ vendor_id: "saved" }, [{ id: "other" }])).toBe("saved");
    expect(initialContractVendor({ vendor_id: "saved" }, [])).toBe("saved");
  });
});

describe("contract date order (#1494)", () => {
  const filled = { vendorId: "v", materialId: "m", quantity: "10", unitCost: "" };

  it("names an end date before the start date, inline and as the save reason", () => {
    expect(contractDateError("2026-10-20", "2026-10-10")).toBe("Enter an end date on or after the start date.");
    expect(contractSubmitReason({ ...filled, starts: "2026-10-20", ends: "2026-10-10" })).toBe("Still needed: an end date on or after the start date.");
  });

  it("accepts equal dates or a blank date", () => {
    for (const [starts, ends] of [["2026-10-20", "2026-10-20"], ["2026-10-20", ""], ["", "2026-10-10"], ["", ""]]) {
      expect(contractDateError(starts, ends)).toBeUndefined();
      expect(contractSubmitReason({ ...filled, starts, ends })).toBeNull();
    }
  });

  it("the command refuses an end date before the start date for API callers", () => {
    const input = getCommandDefinition("upsert_material_contract")!.input;
    const base = { vendorId: crypto.randomUUID(), materialId: crypto.randomUUID(), qtyCommitted: 1.5 };
    const refused = input.safeParse({ ...base, startsOn: "2026-10-20", endsOn: "2026-10-10" });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map(issue => issue.path)).toEqual([["endsOn"]]);
    expect(input.safeParse({ ...base, startsOn: "2026-10-20", endsOn: "2026-10-20" }).success).toBe(true);
    expect(input.safeParse({ ...base, endsOn: "2026-10-10" }).success).toBe(true);
  });
});
