import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/brewery-provider", () => ({
  useBrewery: () => "brewery-a",
  useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }),
}));
import { LifecycleButtons } from "@/app/(app)/orders/[id]/lifecycle-buttons";
import { OrderView } from "@/components/mgr/views/order";
import { orderPickedRestock } from "@/lib/mgr/fixtures/orders";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import { canRun, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("offers sales and fulfillment actions only to their registered roles", () => {
  function render(role: Ctx["role"], status: "submitted" | "picked") {
    const ctx = { role } as Ctx;
    return renderToStaticMarkup(createElement(LifecycleButtons, { orderId: "order", status, canSell: canRun(ctx, "confirm_order"), canFulfill: canRun(ctx, "record_pick") }));
  }
  expect(render("warehouse", "submitted")).not.toContain("Confirm");
  expect(render("warehouse", "picked")).not.toContain("Adjust lines");
  expect(render("warehouse", "picked")).not.toContain("Cancel");
  expect(render("sales", "submitted")).toContain("Cancel");
  expect(render("sales", "picked")).not.toContain("Record pick");
  expect(render("sales", "picked")).not.toContain("Ship order");
  expect(render("warehouse", "picked")).toContain("Record pick");
  expect(render("admin", "picked")).toContain("Record pick");
});

// #713: confirming always goes through the review, so stock and source
// warnings show before commit. The detail footer has no direct Confirm.
it("confirms a submitted order only through Review and confirm (#713)", () => {
  const submitted = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "submitted" as const, needs_restock: false }, backHref: "/orders" };
  const footer = createElement(LifecycleButtons, { orderId: submitted.order.id, status: "submitted", canSell: true, canFulfill: true });
  const html = renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(submitted), footer }));
  expect(html).not.toMatch(/>Confirm</);
  expect(html.match(/Review and confirm/g)).toHaveLength(1);
  expect(html).toContain(`href="/orders/${submitted.order.id}/confirm"`);
  expect(html).toContain("Cancel");
});
