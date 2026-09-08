import { expect, it } from "vitest";
import { toPortalOrdersViewProps } from "@/lib/mgr/portal-orders-view";
import { toPortalAccountViewProps } from "@/lib/mgr/portal-account-view";

it("keeps draft continuation and exact reorder identity, including short shipments", () => {
  const orders = ["draft", "shipped"].map((status, i) => ({ id: `order-${i}`, order_no: i, status, requested_ship_date: null, order_lines: [{ id: "line", qty_ordered: 4, qty_shipped: status === "shipped" ? 2 : null }] }));
  const rows = toPortalOrdersViewProps({ customerName: "Buyer", orders }).rows;
  expect(rows[0]).toMatchObject({ verb: "Continue / edit", href: "/portal/orders/order-0", actionHref: "/portal?draft=order-0" });
  expect(rows[1]).toMatchObject({ verb: "Reorder", href: "/portal/orders/order-1", actionHref: "/portal?reorder=order-1", warning: true });
});
it("keeps the persisted default ship-to marker", () => {
  const account = { customer: { id: "buyer", name: "Buyer" }, membership: { userId: "actor" }, deposits: [], shipTos: [{ id: "ship", label: "Back door", city: "Town", state: "PA", is_default: true }] };
  expect(toPortalAccountViewProps(account).shipTos[0].title).toContain("default");
});
