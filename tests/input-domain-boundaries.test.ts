import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isNumber, numberNotationError } from "@/lib/mgr/quantity-input";
import { isCompleteLine, orderLineError, draftLineErrors } from "@/lib/order-form-rules";
import { movementFieldErrors, movementFields } from "@/lib/movement-form";
import { waterPpmError, toWaterProfileFields } from "@/lib/mgr/water-profiles-view";
import { pastPlanWarning } from "@/lib/mgr/schedule-batch-view";
import { breweryDate } from "@/lib/date-format";
import { WaterProfileView } from "@/components/mgr/views/water-profile";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { scheduleBatchHazy } from "@/lib/mgr/fixtures/production";
import { approvalNumberError, colaUrl } from "@/lib/mgr/brand-approval-view";
import { BrandApprovalView } from "@/components/mgr/views/brand-approval";
import { brandApprovalStout } from "@/lib/mgr/fixtures/compliance";
describe("typed decimal notation", () => {
  it.each(["1e3", "1E3", "1e-3"])("rejects %s before numeric conversion", value => {
    expect(isNumber(value)).toBe(false);
    expect(numberNotationError(value)).toBeDefined();
    expect(isCompleteLine({ skuId: "sku", qty: value })).toBe(false);
    expect(orderLineError({ skuId: "sku", qty: value }, 0, 1).qty).toBeDefined();
    expect(draftLineErrors([{ skuId: "sku", qty: value }], ["sku"])[0].qty).toBeDefined();
    expect(movementFieldErrors("opening_balance", value, "").qty).toBeDefined();
    expect(() => movementFields("opening_balance", value, "add", "", "")).toThrow();
    expect(waterPpmError(value)).toBeDefined();
  });

  it.each(["0.5", "1.5", "12.345", ".25", "1."])("preserves legal ordinary fractional input %s", value => {
    expect(isNumber(value)).toBe(true);
    expect(isCompleteLine({ skuId: "sku", qty: value })).toBe(true);
    expect(orderLineError({ skuId: "sku", qty: value }, 0, 1)).toEqual({});
  });

  it("uses the actual order-line numeric(12,2) storage bound", () => {
    expect(isCompleteLine({ skuId: "sku", qty: "9999999999.99" })).toBe(true);
    expect(isCompleteLine({ skuId: "sku", qty: "99999999999" })).toBe(false);
    expect(orderLineError({ skuId: "sku", qty: "99999999999" }, 0, 1).qty).toBeDefined();
    expect(draftLineErrors([{ skuId: "sku", qty: "99999999999" }], ["sku"])[0].qty).toBeDefined();
  });
});

describe("water storage guidance", () => {
  it("allows fractions and optional blank alkalinity, but rejects values outside numeric(7,1)", () => {
    expect(waterPpmError("0")).toBeUndefined();
    expect(waterPpmError("999999.129")).toBeUndefined();
    expect(waterPpmError("999999.9")).toBeUndefined();
    expect(waterPpmError("999999.91")).toBeDefined();
    expect(waterPpmError("-1")).toBeDefined();
    expect(waterPpmError("")).toBeDefined();
    expect(waterPpmError("", true)).toBeUndefined();
  });

  it("keeps the actual input bounds and counts notes only near their existing limit", () => {
    const fields = { ...toWaterProfileFields(), note: "a".repeat(1800) };
    const html = renderToStaticMarkup(createElement(WaterProfileView, { fields }));
    expect(html).toContain('max="999999.9"');
    expect(html.match(/<output[^>]*>(\d+)\s*\/\s*(\d+)/)?.slice(1)).toEqual(["1800", "2000"]);
    const belowLimit = renderToStaticMarkup(createElement(WaterProfileView, { fields: { ...fields, note: "a".repeat(1799) } }));
    expect(belowLimit).not.toContain("<output");
    expect(html).toContain('maxLength="2000"');
  });
});

describe("past batch plans", () => {
  it("warns without prohibiting historical plans or pretending to record brew day", () => {
    expect(pastPlanWarning("2026-10-15", "2026-10-23")).toBeDefined();
    expect(pastPlanWarning("2026-10-23", "2026-10-23")).toBeUndefined();
    expect(pastPlanWarning("2026-10-24", "2026-10-23")).toBeUndefined();
    expect(pastPlanWarning("", "2026-10-23")).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ScheduleBatchView, { model: { ...scheduleBatchHazy, date: "2026-10-15", today: "2026-10-23" } }));
    expect(html).toContain('role="note"');
    const future = renderToStaticMarkup(createElement(ScheduleBatchView, { model: { ...scheduleBatchHazy, date: "2026-10-24", today: "2026-10-23" } }));
    expect(future).not.toContain('role="note"');
  });

  it("compares brewery calendar days rather than the UTC date", () => {
    const today = breweryDate("America/Los_Angeles", new Date("2026-10-24T02:00:00Z"));
    expect(today).toBe("2026-10-23");
    expect(pastPlanWarning("2026-10-23", today)).toBeUndefined();
    expect(pastPlanWarning("2026-10-22", today)).toBeDefined();
  });
});


it("enforces the published COLA-only format while preserving zeros and formula numbers", () => {
  expect(approvalNumberError("cola", "00318001000102")).toBeUndefined();
  expect(approvalNumberError("formula", "F-0042")).toBeUndefined();
  for (const value of ["abc🍺", "2531800100003", "253180010000345", "2531800100003🍺"]) {
    expect(approvalNumberError("cola", value)).toBeDefined();
    expect(colaUrl(value)).toBeNull();
  }
  const html = renderToStaticMarkup(createElement(BrandApprovalView, { model: { ...brandApprovalStout, number: "abc🍺" } }));
  expect(html).toContain('maxLength="14"');
  expect(html).toContain('pattern="[0-9]{14}"');
  expect(html).not.toContain('href="https://ttbonline.gov/');
  const formula = renderToStaticMarkup(createElement(BrandApprovalView, { model: { ...brandApprovalStout, kind: "formula", number: "F-0042" } }));
  expect(formula).not.toContain('maxLength="14"');
  expect(formula).not.toContain('pattern="[0-9]{14}"');
});
