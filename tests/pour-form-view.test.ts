// tests/pour-form-view.test.ts — Add pour / Edit pour serving-size checks
// (#1492): the field error and Save pour's reason read pourOuncesError, which
// keeps the existing 0 < oz < 1000 bounds at the table's four-decimal storage.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pourOuncesError, pourReason, toSkuViewProps } from "@/lib/mgr/sku-view";
import { SkuView } from "@/components/mgr/views/sku";

describe("pourOuncesError", () => {
  it.each(["0.5", "16", "999.9999", "0.0001", "0.001", " 12 "])("accepts %j", value => {
    expect(pourOuncesError(value)).toBeUndefined();
    expect(pourReason(value)).toBeNull();
  });

  it.each([
    ["1e1", /exponent notation/],
    ["", /Enter a serving size/],
    ["abc", /Enter a serving size/],
    ["-5", /above 0 oz/],
    ["0", /above 0 oz/],
    // numeric(12,4) stores these as 0.0000, which the table check refuses.
    ["0.00004", /four decimal places/],
    ["1000", /under 1000 oz/],
    // Rounds to 1000.0000 when stored.
    ["999.99995", /under 1000 oz/],
  ])("refuses %j", (value, message) => {
    expect(pourOuncesError(value)).toMatch(message);
    expect(pourReason(value)).toMatch(/^Still needed: a serving size/);
  });
});

it("draws the serving-size error under the field of a pour sheet", () => {
  const html = renderToStaticMarkup(createElement(SkuView, {
    model: { ...toSkuViewProps({ formats: [] }), kind: "poured", pourName: "", ounces: "1e1" },
    locked: true,
  }));
  expect(html).toContain("exponent notation");
  expect(html).toMatch(/aria-invalid="true"/);
});
