import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/lib/brewery-provider", () => ({
  useBrewery: () => "brewery-a",
  useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }),
}));
import { CancelOrderAction, LifecycleButtons, OrderActionScope } from "@/app/(app)/orders/[id]/lifecycle-buttons";
import { readFileSync } from "node:fs";
import { OrderView } from "@/components/mgr/views/order";
import { orderPickedRestock } from "@/lib/mgr/fixtures/orders";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import { canRun, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("offers sales and fulfillment actions only to their registered roles", () => {
  function render(role: Ctx["roles"][number], status: "submitted" | "picked") {
    const ctx = { roles: [role] } as Ctx;
    const canSell = canRun(ctx, "confirm_order");
    return renderToStaticMarkup(createElement(OrderActionScope, null,
      createElement(LifecycleButtons, { orderId: "order", status, canSell, canFulfill: canRun(ctx, "record_pick") }),
      createElement(CancelOrderAction, { orderId: "order", status, canSell })));
  }
  expect(render("warehouse", "submitted")).not.toContain("Confirm");
  // Lines add and remove in place on the order (#1503), so no header verb opens a separate page.
  expect(render("sales", "picked")).not.toContain("Add or remove lines");
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
  const actions = createElement(LifecycleButtons, { orderId: submitted.order.id, status: "submitted", canSell: true, canFulfill: true });
  const footer = createElement(CancelOrderAction, { orderId: submitted.order.id, status: "submitted", canSell: true });
  const html = renderToStaticMarkup(createElement(OrderActionScope, null, createElement(OrderView, { model: toOrderViewProps(submitted), actions, footer })));
  expect(html).not.toMatch(/>Confirm</);
  expect(html.match(/Review and confirm/g)).toHaveLength(1);
  expect(html).toContain(`href="/orders/${submitted.order.id}/confirm"`);
  expect(html).toContain("Cancel");
});

// #976: the next verb leads the header and Cancel is the quiet bottom row, once each.
it("draws the primary verb first, Complete transfer once, and Cancel only in the bottom row", () => {
  const picked = { ...orderPickedRestock, order: { ...orderPickedRestock.order, kind: "taproom_transfer" as const, needs_restock: false }, backHref: "/orders" };
  const actions = createElement(LifecycleButtons, { orderId: picked.order.id, status: "picked", transfer: true, canSell: true, canFulfill: true });
  const footer = createElement(CancelOrderAction, { orderId: picked.order.id, status: "picked", canSell: true });
  const html = renderToStaticMarkup(createElement(OrderActionScope, null, createElement(OrderView, { model: toOrderViewProps(picked), actions, footer })));
  expect(html.match(/>Complete transfer</g)).toHaveLength(1);
  expect(html.indexOf(">Complete transfer<")).toBeLessThan(html.indexOf(">Record pick<"));
  expect(html.match(/>Cancel order</g)).toHaveLength(1);
  expect(html.indexOf(">Cancel order<")).toBeGreaterThan(html.indexOf(">History<"));
  expect(renderToStaticMarkup(createElement(OrderActionScope, null, createElement(CancelOrderAction, { orderId: "o", status: "shipped", canSell: true })))).toBe("");
});

it("the live page fills OrderView's header and bottom slots from lifecycle-buttons.tsx", () => {
  const src = readFileSync("app/(app)/orders/[id]/page.tsx", "utf8");
  expect(src).toMatch(/actions=\{<LifecycleButtons\b/);
  expect(src).toMatch(/footer=\{<CancelOrderAction\b/);
  expect(src).toMatch(/<OrderActionScope>[\s\S]*?<OrderLinesForm\b/);
});

// Restock outranks fulfillment: staged beer goes back before anything ships.
it("makes Put back the filled primary while beer is staged, and fulfillment verbs secondary", () => {
  // The variant E.btn gave the button or link carrying this label: "default" is filled, "outline" secondary.
  const variant = (html: string, label: string) => html.match(new RegExp(`data-variant="(\\w+)"[^>]*>${label}<`))?.[1];
  const staged = { ...orderPickedRestock, backHref: "/orders" };
  const render = (restockFirst: boolean, model = toOrderViewProps(staged)) => renderToStaticMarkup(createElement(OrderActionScope, null, createElement(OrderView, {
    model, actions: createElement(LifecycleButtons, { orderId: staged.order.id, status: "picked", restockFirst, canSell: true, canFulfill: true }),
  })));
  const html = render(true);
  expect(html.indexOf(">Put back<")).toBeLessThan(html.indexOf(">Ship<"));
  expect(variant(html, "Put back")).toBe("default");
  expect(variant(html, "Ship")).toBe("outline");
  expect(variant(html, "Record pick")).toBe("outline");
  const clear = render(false, toOrderViewProps({ ...staged, order: { ...staged.order, needs_restock: false } }));
  expect(clear).not.toContain(">Put back<");
  expect(variant(clear, "Ship")).toBe("default");
  expect(readFileSync("app/(app)/orders/[id]/page.tsx", "utf8")).toMatch(/restockFirst=\{model\.putBackHref !== undefined\}/);
});
