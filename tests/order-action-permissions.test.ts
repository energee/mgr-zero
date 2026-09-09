import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/app/(app)/brewery-provider", () => ({
  useBrewery: () => "brewery-a",
  useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }),
}));
import { LifecycleButtons } from "@/app/(app)/orders/[id]/lifecycle-buttons";
import { canRun, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("offers sales and fulfillment actions only to their registered roles", () => {
  function render(role: Ctx["role"], status: "submitted" | "picked") {
    const ctx = { role } as Ctx;
    return renderToStaticMarkup(createElement(LifecycleButtons, { orderId: "order", status, lines: [], skus: [], pickLines: [], canSell: canRun(ctx, "confirm_order"), canFulfill: canRun(ctx, "record_pick") }));
  }
  expect(render("warehouse", "submitted")).not.toContain("Confirm");
  expect(render("warehouse", "picked")).not.toContain("Adjust lines");
  expect(render("warehouse", "picked")).not.toContain("Cancel");
  expect(render("sales", "submitted")).toContain("Confirm");
  expect(render("sales", "picked")).not.toContain("Record pick");
  expect(render("sales", "picked")).not.toContain("Ship order");
  expect(render("warehouse", "picked")).toContain("Record pick");
  expect(render("admin", "picked")).toContain("Record pick");
});
