// tests/vendor-detail-view.test.ts — the vendor page's view model (#1586):
// facts in order, read-only contract rows, open PO rows, default materials,
// and the Brewer case where purchase orders are not read at all.
import { describe, expect, it } from "vitest";
import { contractRowView } from "@/lib/mgr/contracts-view";
import { toVendorDetailViewProps, type VendorDetailSnapshot } from "@/lib/mgr/vendor-detail-view";

const contract = { id: "c1", contract_no: "CITRA-2026", material_name: "Citra", qty_committed: 400, qty_received: 262, qty_on_order: 100, qty_available: 38 };
const snapshot: VendorDetailSnapshot = {
  backHref: "/vendors",
  vendor: {
    key: "ych", name: "YCH", active: true, lead_time_days: 7, email: "orders@ych.example", phone: "509-555-0142", payment_terms: "net30",
    observed: [{ sent_via: "mailto", n: 4, avg_lead_days: 6.5 }],
    contracts: [contract],
  },
  purchaseOrders: [
    { id: "po1", po_no: 141, status: "partially_received", closed_at: null, ordered_on: "2026-09-01", expected_on: null, lines_open: 1 },
    { id: "po2", po_no: 143, status: "draft", closed_at: null, ordered_on: null, expected_on: null, lines_open: 2 },
  ],
  materials: [
    { id: "m1", name: "Citra", category: "hop", purchase_uom: "lb", active: true },
    { id: "m2", name: "Galaxy", category: "hop", purchase_uom: "each", active: false },
  ],
};

describe("toVendorDetailViewProps", () => {
  it("lists the facts in order, terms as a label, and observed lead time from the Vendors row", () => {
    const model = toVendorDetailViewProps(snapshot);
    expect(model.title).toBe("YCH");
    expect(model.backHref).toBe("/vendors");
    expect(model.facts).toEqual([
      ["Status", "Active"],
      ["Email", "orders@ych.example"],
      ["Phone", "509-555-0142"],
      ["Terms", "Net 30"],
      ["Lead time", "7 days"],
      ["Observed lead time", "6.5 days over 4 orders sent from a mail client"],
    ]);
  });

  it("leaves out a missing email or phone and says when no order has been received", () => {
    const model = toVendorDetailViewProps({ ...snapshot, vendor: { ...snapshot.vendor, email: null, phone: null, observed: [], lead_time_days: null, active: false } });
    expect(model.facts).toEqual([
      ["Status", "Inactive"],
      ["Terms", "Net 30"],
      ["Lead time", "Not typed"],
      ["Observed lead time", "No received orders yet"],
    ]);
  });

  it("draws contracts read-only, without the vendor's name", () => {
    expect(toVendorDetailViewProps(snapshot).contracts.rows).toEqual([contractRowView(contract)]);
    expect(toVendorDetailViewProps(snapshot).contracts.rows[0].verb).toBeUndefined();
  });

  it("names each open order by number, status and next action, linking its page", () => {
    expect(toVendorDetailViewProps(snapshot).purchaseOrders?.rows).toEqual([
      { key: "po1", title: "PO-0141", detail: "Partially received · 1 line still due", verb: "Receive", tone: "attention", warning: true, href: "/purchase-orders/po1" },
      { key: "po2", title: "PO-0143", detail: "Draft", verb: "Mark sent", tone: "info", warning: false, href: "/purchase-orders/po2" },
    ]);
  });

  it("has no purchase order section when the viewer may not read orders", () => {
    expect(toVendorDetailViewProps({ ...snapshot, purchaseOrders: null }).purchaseOrders).toBeNull();
  });

  it("names each default material's type and purchase unit, marking an inactive one", () => {
    expect(toVendorDetailViewProps(snapshot).materials.rows).toEqual([
      { key: "m1", title: "Citra", detail: "Hop · lb" },
      { key: "m2", title: "Galaxy", detail: "Hop · each · Inactive" },
    ]);
  });

  it("gives each empty section its own empty state", () => {
    const model = toVendorDetailViewProps({ ...snapshot, vendor: { ...snapshot.vendor, contracts: [] }, purchaseOrders: [], materials: [] });
    expect(model.contracts.empty?.title).toBe("No contracts yet");
    expect(model.purchaseOrders?.empty?.title).toBe("No open purchase orders");
    expect(model.materials.empty?.title).toBe("No default materials");
    const full = toVendorDetailViewProps(snapshot);
    expect([full.contracts.empty, full.purchaseOrders?.empty, full.materials.empty]).toEqual([undefined, undefined, undefined]);
  });
});
