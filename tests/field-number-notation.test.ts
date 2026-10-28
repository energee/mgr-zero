// Text-entry notation policy must not change accepted plain decimal domain values.
import { expect, it } from "vitest";
import { plannedBarrelsError } from "@/lib/mgr/schedule-batch-view";
import { replenishmentQuantityError } from "@/lib/replenishment-form";
import { repackQuantityError } from "@/lib/mgr/repack-view";
import { brandAbvError } from "@/lib/mgr/brand-abv";
import { priceGroupFieldErrors } from "@/lib/mgr/price-group-view";
import { vendorFieldErrors } from "@/lib/mgr/vendor-view";
import { waterPhError } from "@/lib/mgr/water-profiles-view";

it.each(["1e1", "1E1", "1e+1", "1e-1"])("rejects exponent entry %s at each field's readiness boundary", value => {
  expect(plannedBarrelsError(value)).toBeTruthy();
  expect(replenishmentQuantityError(value)).toBeTruthy();
  expect(repackQuantityError(value)).toBeTruthy();
  expect(brandAbvError(value)).toBeTruthy();
  expect(priceGroupFieldErrors({ position: value, costCeilingInput: value })).toEqual({ position: expect.any(String), costCeiling: expect.any(String) });
  expect(vendorFieldErrors({ email: "", phone: "", leadDays: value }).leadDays).toBeTruthy();
  expect(waterPhError(value)).toBeTruthy();
});

it("#1479 refuses planned barrels that store as zero at three decimals", () => {
  expect(plannedBarrelsError("0.0004")).toBe("Enter at least 0.001 barrels; planned barrels are stored to three decimal places.");
  expect(plannedBarrelsError("0.0005")).toBeUndefined();
  expect(plannedBarrelsError("0.001")).toBeUndefined();
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
