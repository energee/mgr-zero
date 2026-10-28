// Text-entry notation policy must not change accepted plain decimal domain values.
import { expect, it } from "vitest";
import { plannedBarrelsError } from "@/lib/mgr/schedule-batch-view";
import { replenishmentQuantityError } from "@/lib/replenishment-form";
import { repackQuantityError } from "@/lib/mgr/repack-view";
import { brandAbvError } from "@/lib/mgr/brand-abv";
import { priceGroupFieldErrors } from "@/lib/mgr/price-group-view";
import { vendorFieldErrors } from "@/lib/mgr/vendor-view";
import { waterPhError } from "@/lib/mgr/water-profiles-view";
import { newPoReason, poLineErrors } from "@/lib/mgr/new-po-view";
import { contractSubmitReason } from "@/lib/mgr/contract-view";
import { packageQtyError } from "@/lib/mgr/schedule-packaging-run-view";

it.each(["1e1", "1E1", "1e+1", "1e-1"])("rejects exponent entry %s at each field's readiness boundary", value => {
  expect(plannedBarrelsError(value)).toBeTruthy();
  expect(replenishmentQuantityError(value)).toBeTruthy();
  expect(repackQuantityError(value)).toBeTruthy();
  expect(brandAbvError(value)).toBeTruthy();
  expect(priceGroupFieldErrors({ position: value, costCeilingInput: value })).toEqual({ position: expect.any(String), costCeiling: expect.any(String) });
  expect(vendorFieldErrors({ email: "", phone: "", leadDays: value }).leadDays).toBeTruthy();
  expect(waterPhError(value)).toBeTruthy();
});

it("retains ordinary decimal and whole-number entries", () => {
  for (const value of ["0.5", ".5", "2.555", "10"]) {
    expect(plannedBarrelsError(value)).toBeUndefined();
    expect(replenishmentQuantityError(value)).toBeUndefined();
    expect(repackQuantityError(value)).toBeUndefined();
    expect(brandAbvError(value)).toBeUndefined();
    expect(priceGroupFieldErrors({ position: "1", costCeilingInput: value })).toEqual({});
    expect(waterPhError(value)).toBeUndefined();
  }
  expect(vendorFieldErrors({ email: "", phone: "", leadDays: "10" })).toEqual({});
  expect(priceGroupFieldErrors({ position: "10", costCeilingInput: "0" })).toEqual({});
});

// #1482: each field stops at its column's storage bound, so an oversize value is
// named at the field and withholds Save instead of failing in the database.
it("bounds purchasing and planned-output quantities by their columns (#1482)", () => {
  const po = (qty: string, cost = "") => newPoReason({ vendor: "v", lines: [{ materialId: "m", qty, cost }] });
  expect(po("9999999999.9999", "21474836.47")).toBeNull();
  expect(po("10000000000")).not.toBeNull();
  expect(po("4", "21474836.48")).not.toBeNull();
  expect(po("1e3")).not.toBeNull();
  expect(po("4", "1e3")).not.toBeNull();
  expect(poLineErrors({ qty: "10000000000", cost: "21474836.48" })).toEqual({
    qty: "Enter a quantity no greater than 9,999,999,999.9999.",
    cost: "Enter a cost no greater than $21,474,836.47.",
  });

  const contract = (quantity: string, unitCost = "") => contractSubmitReason({ vendorId: "v", materialId: "m", quantity, unitCost, starts: "", ends: "" });
  expect(contract("9999999999.9999", "21474836.47")).toBeNull();
  expect(contract("10000000000")).not.toBeNull();
  expect(contract("4", "21474836.48")).not.toBeNull();
  expect(contract("1e3")).not.toBeNull();

  expect(vendorFieldErrors({ email: "", phone: "", leadDays: "2147483647" })).toEqual({});
  expect(vendorFieldErrors({ email: "", phone: "", leadDays: "2147483648" }).leadDays).toBe("Enter a lead time no greater than 2,147,483,647 days.");

  expect(packageQtyError("9999999999.99")).toBeUndefined();
  expect(packageQtyError("9999999999", true)).toBeUndefined();
  expect(packageQtyError("99999999999", true)).toBe("Enter a quantity no greater than 9,999,999,999.99.");
  expect(packageQtyError("1e3")).toBeTruthy();
});
