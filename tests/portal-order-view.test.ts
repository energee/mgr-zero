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

describe("portal order brand alias", () => {
  it("names a line brand · format with the brand's alias muted under it", () => {
    const giraffe = { name: "Animal #31 · Sixtel", brands: { name: "Masai Giraffe", alias: "Animal #31" }, formats: { name: "Sixtel" } };
    const model = toPortalOrderViewProps({ ...portalOrderShipped, lines: [{ ...portalOrderShipped.lines[0], skus: giraffe }] });
    expect(model.lines[0]).toMatchObject({ name: "Masai Giraffe · Sixtel", alias: "Animal #31" });
    expect(renderToStaticMarkup(createElement(PortalOrderView, { model }))).toContain('<span>Masai Giraffe · Sixtel</span><span class="text-xs font-normal text-muted-foreground">Animal #31</span>');
  });
});
