// Gates actual-field correction placement and valid domain precision in shared forms.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { NewTransferView } from "@/components/mgr/views/new-transfer";
import { NewPoView } from "@/components/mgr/views/new-po";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { newOrderDraft } from "@/lib/mgr/fixtures/orders";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";

function fieldContaining(markup: string, label: string): string | undefined {
  const input = markup.indexOf(`aria-label="${label}"`);
  const start = markup.lastIndexOf('<div role="group" data-slot="field"', input);
  if (input < 0 || start < 0) return undefined;
  let depth = 0;
  for (const tag of markup.slice(start).matchAll(/<\/?div\b[^>]*>/g)) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return markup.slice(start, start + tag.index + tag[0].length);
  }
}

describe("Oct 23 field corrections", () => {
  it("keeps an order quantity correction inside its quantity field, not under the SKU", () => {
    const model = { ...toNewOrderViewProps(newOrderDraft), lines: [{ name: "SKU", skuId: "s", qty: "-3", warning: false }] };
    const markup = renderToStaticMarkup(createElement(NewOrderView, { model }));
    expect(fieldContaining(markup, "Line 1 quantity")).toContain("Line 1: enter a quantity greater than zero.");
  });

  it("keeps transfer corrections below the actual quantity", () => {
    const model = { from: "", fromOptions: [], fromBin: "", fromBinOptions: [], to: "", toOptions: [], toBin: "", toBinOptions: [], skuOptions: [], lines: [{ sku: "s", title: "SKU", qty: "-2" }] };
    const markup = renderToStaticMarkup(createElement(NewTransferView, { model }));
    expect(fieldContaining(markup, "Line 1 qty")).toContain("Line 1: enter a quantity greater than zero.");
  });

  it("marks invalid planned barrels inline while retaining valid fractions", () => {
    const model = { recipe: "", recipeOptions: [], brand: "", brandOptions: [], plannedBbl: "-1", date: "", note: "" };
    const markup = renderToStaticMarkup(createElement(ScheduleBatchView, { model }));
    expect(markup).toContain('aria-invalid="true"');
    expect(fieldContaining(markup, "Planned barrels")).toContain("Enter planned barrels above zero.");
    expect(scheduleBatchReason({ date: "2026-10-23", plannedBbl: "1.5" })).toBeNull();
    expect(scheduleBatchReason({ date: "2026-10-23", plannedBbl: "Infinity" })).not.toBeNull();
    expect(scheduleBatchReason({ date: "2026-10-23", plannedBbl: "10000000" })).not.toBeNull();
  });

  it("keeps PO quantity and cost visibly labelled and corrections in their own fields", () => {
    const model = { vendor: "", expected: "", lines: [{ key: "a", title: "Material", detail: "", qty: "-4", cost: "-3" }] };
    const markup = renderToStaticMarkup(createElement(NewPoView, { model }));
    expect(markup).toMatch(/<label[^>]*>Quantity<\/label>/);
    expect(fieldContaining(markup, "Line 1 quantity")).toContain("Enter a quantity above zero.");
    expect(fieldContaining(markup, "Line 1 unit cost")).toContain("Enter a cost of zero or more.");
  });
});
