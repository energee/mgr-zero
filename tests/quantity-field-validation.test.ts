import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReplenishmentQuantityView } from "@/components/mgr/views/replenishment-quantity";
import { RepackView } from "@/components/mgr/views/repack";
import { replenishmentQuantityError, replenishmentQuantityReason } from "@/lib/replenishment-form";
import { repackQuantityError, repackReason, toRepackView } from "@/lib/mgr/repack-view";

function expectAssociatedError(markup: string, label: string, correction: string): void {
  const input = [...markup.matchAll(/<input\b[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`aria-label="${label}"`));
  expect(input).toBeDefined();
  expect(input).toContain('aria-invalid="true"');
  const id = input?.match(/\bid="([^"]+)"/)?.[1];
  expect(id).toBeTruthy();
  expect(input).toContain(`${id}-error`);
  expect(markup).toContain(`id="${id}-error"`);
  const inputIndex = markup.indexOf(input!);
  const nextField = markup.indexOf('data-slot="field"', inputIndex);
  expect(markup.slice(inputIndex, nextField === -1 ? undefined : nextField)).toContain(correction);
}

const skus = [{ id: "sku", name: "Lantern Pils · case" }];
const repack = toRepackView({ parent: "Lantern Pils · case", unit: "case", qty: "-2", composition: { childLabel: "four-pack", quantity: 6, parentBbl: 0.096774 } });

describe("replenishment quantity corrections", () => {
  it.each(["par", "standing"] as const)("associates the %s correction with its actual quantity field", kind => {
    const markup = renderToStaticMarkup(createElement(ReplenishmentQuantityView, { kind, skus, skuId: "sku", qty: "-1" }));
    expectAssociatedError(markup, kind === "par" ? "Par quantity" : "Reserved quantity", "Enter a quantity of zero or more.");
  });

  it("waits for live interaction, then shows the same correction on attempted submit", () => {
    const props = { kind: "par" as const, skus, skuId: "sku", qty: "-1", onQuantity: () => {} };
    expect(renderToStaticMarkup(createElement(ReplenishmentQuantityView, props))).not.toContain('aria-invalid="true"');
    expectAssociatedError(renderToStaticMarkup(createElement(ReplenishmentQuantityView, { ...props, submitted: true })), "Par quantity", "Enter a quantity of zero or more.");
  });

  it.each(["", " ", "-1", "not a number", "Infinity", "10000000000"])("blocks invalid quantity %j using the readiness rule", qty => {
    expect(replenishmentQuantityError(qty)).toBeTruthy();
    expect(replenishmentQuantityReason("sku", qty)).not.toBeNull();
  });

  it.each(["0", "2.5", "2.555", "9999999999.99"])("preserves valid zero and fractional quantity %j", qty => {
    expect(replenishmentQuantityError(qty)).toBeUndefined();
    expect(replenishmentQuantityReason("sku", qty)).toBeNull();
  });
});

describe("repack quantity corrections", () => {
  it("associates the correction with Packages to repack", () => {
    const markup = renderToStaticMarkup(createElement(RepackView, { model: repack, footer: null }));
    expectAssociatedError(markup, "Packages to repack", "Enter a quantity above zero.");
  });

  it("keeps a live untouched error hidden and reveals it on attempted submit", () => {
    const props = { model: repack, footer: null, onQuantity: () => {} };
    expect(renderToStaticMarkup(createElement(RepackView, props))).not.toContain('aria-invalid="true"');
    expectAssociatedError(renderToStaticMarkup(createElement(RepackView, { ...props, submitted: true })), "Packages to repack", "Enter a quantity above zero.");
  });

  it.each(["", "0", "-2", "no", "Infinity", "10000000000"])("blocks invalid repack quantity %j", qty => {
    expect(repackQuantityError(qty)).toBeTruthy();
    expect(repackReason({ parentSkuId: "parent", locationId: "location", binId: "bin", qty })).not.toBeNull();
  });

  it.each(["1.5", "2.555", "9999999999.99"])("retains valid fractional repack quantity %j", qty => {
    expect(repackQuantityError(qty)).toBeUndefined();
    expect(repackReason({ parentSkuId: "parent", locationId: "location", binId: "bin", qty })).toBeNull();
  });
});
