// Draft-edit contracts: date clearing and role-gated navigation before submission.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditDraftOrderView } from "@/components/mgr/views/edit-draft-order";
import { editDraftOrder } from "@/lib/mgr/fixtures/edit-draft-order";
import { getCommandDefinition, canRun, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/orders";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import { orderPickedRestock } from "@/lib/mgr/fixtures/orders";

describe("staff draft editing", () => {
  const orderId = "f0ad7816-04d4-4281-a788-4fe7c13c9211";
  const input = { orderId, lines: [{ skuId: orderId, qty: 2 }] };
  it("accepts explicit null to clear requested date without changing omitted preservation", () => {
    const schema = getCommandDefinition("update_draft_order")!.input;
    expect(schema.safeParse({ ...input, requestedShipDate: null }).success).toBe(true);
    expect(schema.parse(input)).not.toHaveProperty("requestedShipDate");
    expect(schema.parse({ ...input, requestedShipDate: "2026-10-12" })).toHaveProperty("requestedShipDate", "2026-10-12");
    expect(schema.safeParse({ ...input, requestedShipDate: "bad" }).success).toBe(false);
  });
  it.each([{ lines: [] }, { lines: [{ skuId: "pils", qty: "3" }, { skuId: "", qty: "" }] }, { lines: [{ skuId: "pils", qty: "Infinity" }] }])("disables saving an incomplete or nonfinite replacement line set", ({ lines }) => {
    const html = renderToStaticMarkup(createElement(EditDraftOrderView, { model: { ...editDraftOrder, lines }, error: "Save refused" }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).toContain("Save refused");
  });
  it.each([{ lines: [{ skuId: "pils", qty: "0.001" }] }, { lines: [{ skuId: "pils", qty: "2" }, { skuId: "pils", qty: "3" }] }])("blocks rounded-to-zero quantities and duplicate SKU rows", ({ lines }) => {
    const html = renderToStaticMarkup(createElement(EditDraftOrderView, { model: { ...editDraftOrder, lines } }));
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).toContain("Line");
  });
  it("refuses saved SKUs or ship-tos absent from the available options", () => {
    for (const model of [{ ...editDraftOrder, skus: [] }, { ...editDraftOrder, shipTos: [] }]) {
      const html = renderToStaticMarkup(createElement(EditDraftOrderView, { model }));
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    }
  });
  it("shows the prefilled shared editor without mutable customer or source pickers", () => {
    const html = renderToStaticMarkup(createElement(EditDraftOrderView, { model: editDraftOrder }));
    expect(html).toContain("River Market");
    expect(html).toContain("PO-42");
    expect(html).toContain("Edit draft");
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });
  it("keeps editing restricted to Admin and Sales", () => {
    for (const role of ["admin", "sales", "warehouse", "brewer", "customer"] as const) {
      expect(canRun({ role } as Ctx, "update_draft_order")).toBe(role === "admin" || role === "sales");
    }
  });
  it("offers edit only for draft and keeps fixture destinations inert", () => {
    for (const status of ["draft", "submitted", "confirmed", "picked", "shipped", "cancelled"] as const) {
      const snapshot = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status } };
      expect(toOrderViewProps(snapshot)).toHaveProperty("editHref", status === "draft" ? "#" : undefined);
      expect(toOrderViewProps({ ...snapshot, backHref: "/orders" })).toHaveProperty("editHref", status === "draft" ? `/orders/${snapshot.order.id}/edit` : undefined);
    }
  });
});
