// tests/portal-order-view.test.ts — the buyer sees each change the brewery made
// after confirming their order, with its reason code (Phase C of
// docs/plans/portal-release-windows.md), from portal_order's changes.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalOrderView } from "../components/mgr/views/portal-order";
import { toPortalOrderViewProps } from "../lib/mgr/portal-order-view";
import { portalOrderChangedAfterConfirm, portalOrderShipped } from "../lib/mgr/fixtures/portal-orders";

const change = (reason_code: string, changes: { name: string | null; delta: number }[]) =>
  ({ id: crypto.randomUUID(), created_at: "2026-08-26T15:00:00.000Z", reason_code, changes: changes.map(c => ({ sku_id: crypto.randomUUID(), ...c })) });

describe("Order detail: changes after confirm", () => {
  it("names each change by its reason, then each line's change with a true minus", () => {
    const model = toPortalOrderViewProps({ ...portalOrderShipped, changes: [
      change("damaged", [{ name: "Monarch 1/6 bbl", delta: -2 }]),
      change("customer_request", [{ name: "Pils · 16 oz case", delta: 3 }, { name: null, delta: -1 }]),
    ] });
    expect(model.changes).toEqual([
      "Changed after confirm: Damaged, Monarch 1/6 bbl −2",
      "Changed after confirm: Customer request, Pils · 16 oz case +3, Item −1",
    ]);
  });

  it("has none when the order was not changed after confirm", () => {
    expect(toPortalOrderViewProps(portalOrderShipped).changes).toEqual([]);
  });

  it("draws the changes on the order", () => {
    const html = renderToStaticMarkup(createElement(PortalOrderView, { model: toPortalOrderViewProps(portalOrderChangedAfterConfirm) }));
    expect(html).toContain("Changed after confirm: Damaged,");
  });
});

describe("portal order brand headings", () => {
  const giraffe = { name: "Animal #31 · Sixtel", brands: { id: "b-giraffe", name: "Masai Giraffe", alias: "Animal #31" }, formats: { name: "Sixtel" } };
  const giraffeCase = { ...giraffe, name: "Animal #31 · Case", formats: { name: "Case" } };
  const pils = { name: "Pils · Case", brands: { id: "b-pils", name: "Pils", alias: null }, formats: { name: "Case" } };

  it("groups lines under their brand, each named by its format, with the brand id for the heading", () => {
    const [l] = portalOrderShipped.lines;
    const model = toPortalOrderViewProps({ ...portalOrderShipped, lines: [{ ...l, id: "p", skus: pils }, { ...l, id: "g1", skus: giraffe }, { ...l, id: "g2", skus: giraffeCase }] });
    expect(model.lines.map((x) => [x.key, x.group, x.alias, x.brandId, x.name])).toEqual([
      ["g2", "Masai Giraffe", "Animal #31", "b-giraffe", "Case"],
      ["g1", "Masai Giraffe", "Animal #31", "b-giraffe", "Sixtel"],
      ["p", "Pils", undefined, "b-pils", "Case"],
    ]);
  });

  it("draws one BrandHeading per brand, and lets the live page supply its own", () => {
    const [l] = portalOrderShipped.lines;
    const model = toPortalOrderViewProps({ ...portalOrderShipped, lines: [{ ...l, id: "g1", skus: giraffe }, { ...l, id: "g2", skus: giraffeCase }] });
    const html = renderToStaticMarkup(createElement(PortalOrderView, { model }));
    expect(html.match(/data-brand-heading/g)).toHaveLength(1);
    expect(html).toMatch(/>Masai Giraffe<\/h2><p[^>]*>Animal #31<\/p>/);
    const live = renderToStaticMarkup(createElement(PortalOrderView, { model, brandHeading: (line) => createElement("i", null, `heading ${line.brandId}`) }));
    expect(live.match(/<i>heading b-giraffe<\/i>/g)).toHaveLength(1);
  });
});
