// tests/close-run-ready.test.ts — when Close packaging run may submit (#433):
// a blank Barrels drawn read as Number("") === 0 and closed the run with
// nothing drawn; a blank actual output closed with 0 of that SKU.
import { describe, expect, it } from "vitest";
import { closeRunReady } from "@/lib/mgr/close-packaging-run-view";

const filled = { bblDrawn: "3.5", actuals: { a: "60", b: "12" }, lotCode: "L1", packagedOn: "2026-09-23", locationId: "loc", binId: "bin" };

describe("closeRunReady", () => {
  it("accepts a fully filled form", () => {
    expect(closeRunReady(filled)).toBe(true);
  });
  it("refuses a blank or zero Barrels drawn", () => {
    expect(closeRunReady({ ...filled, bblDrawn: "" })).toBe(false);
    expect(closeRunReady({ ...filled, bblDrawn: " " })).toBe(false);
    expect(closeRunReady({ ...filled, bblDrawn: "0" })).toBe(false);
  });
  it("refuses a blank actual output, but allows an explicit 0", () => {
    expect(closeRunReady({ ...filled, actuals: { a: "60", b: "" } })).toBe(false);
    expect(closeRunReady({ ...filled, actuals: { a: "60", b: "0" } })).toBe(true);
  });
  it("needs a lot code, date and bin", () => {
    expect(closeRunReady({ ...filled, lotCode: "  " })).toBe(false);
    expect(closeRunReady({ ...filled, binId: "" })).toBe(false);
  });
});
