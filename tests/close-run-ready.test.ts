// tests/close-run-ready.test.ts — when Close packaging run may submit (#433):
// a blank Barrels drawn read as Number("") === 0 and closed the run with
// nothing drawn; a blank actual output closed with 0 of that SKU. The reason
// that withholds it is null only when the form is ready (#1122).
import { describe, expect, it } from "vitest";
import { packagingCloseReason } from "@/lib/mgr/close-packaging-run-view";

const plan = { revision: "r", planned: [], sources: [], materials: [], lots: [] };
const filled = {
  bblDrawn: "3.5", outputs: [{ id: "a", name: "A", qty: "60" }, { id: "b", name: "B", qty: "12" }], lotCode: "L1", packagedOn: "2026-09-23", bestBy: "",
  locationId: "loc", binId: "bin", locations: [], bins: [], plan, actuals: [],
};
const output = (b: string) => [filled.outputs[0], { ...filled.outputs[1], qty: b }];

describe("packagingCloseReason", () => {
  it("accepts a fully filled form", () => {
    expect(packagingCloseReason(filled)).toBeNull();
  });
  it("refuses a blank or zero Barrels drawn", () => {
    expect(packagingCloseReason({ ...filled, bblDrawn: "" })).not.toBeNull();
    expect(packagingCloseReason({ ...filled, bblDrawn: " " })).not.toBeNull();
    expect(packagingCloseReason({ ...filled, bblDrawn: "0" })).not.toBeNull();
  });
  it("refuses a blank actual output, but allows an explicit 0", () => {
    expect(packagingCloseReason({ ...filled, outputs: output("") })).not.toBeNull();
    expect(packagingCloseReason({ ...filled, outputs: output("0") })).toBeNull();
  });
  it("names a negative, exponent or fractional keg count; a fractional case count passes (#1477)", () => {
    const keg = (qty: string) => [filled.outputs[0], { ...filled.outputs[1], qty, whole: true }];
    for (const qty of ["-1", "1e1", "1.5"]) {
      expect(packagingCloseReason({ ...filled, outputs: keg(qty) })).toBe("Still needed: valid actual counts (whole numbers for kegs).");
    }
    expect(packagingCloseReason({ ...filled, outputs: keg("2") })).toBeNull();
    expect(packagingCloseReason({ ...filled, outputs: output("1.5") })).toBeNull();
  });
  it("needs a lot code, date and bin", () => {
    expect(packagingCloseReason({ ...filled, lotCode: "  " })).not.toBeNull();
    expect(packagingCloseReason({ ...filled, binId: "" })).not.toBeNull();
  });
});
