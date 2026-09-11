// Program 14 P5: POS screens share their inventory/live presentation, and an
// uncertain provider response keeps one retryable identity without claiming success.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTerminalPublication, publicationNotice } from "@/lib/mgr/pos-view";
import { SCREEN_ROUTES } from "@/lib/mgr/screen-routes";

describe("POS UI truth", () => {
  it("names uncertain publication by its exact retry identity", () => {
    expect(publicationNotice({ requestId: "request-17", status: "prepared" })).toEqual({
      label: "Outcome unknown",
      detail: "Attempt request-17 is saved. Retry this exact attempt; MGR has not confirmed publication.",
      retry: true,
      tone: "warning",
    });
    expect(publicationNotice({ requestId: "request-17", status: "succeeded" }).label).toBe("Published");
    expect(publicationNotice({ requestId: "request-17", status: "rejected" }).label).toBe("Rejected");
    expect(isTerminalPublication("succeeded")).toBe(true);
    expect(isTerminalPublication("rejected")).toBe(true);
    expect(isTerminalPublication("superseded")).toBe(true);
    expect(isTerminalPublication("prepared")).toBe(false);
  });

  it("mounts one shared view from every POS inventory record", () => {
    const source = readFileSync("components/mgr/screens.tsx", "utf8");
    for (const view of [
      "PointOfSaleView", "ConnectSquareView", "SquareLocationsView", "SquareConnectorView",
      "DisconnectSquareView", "PosMappingView", "PosSaleDetailView", "PosMenuView", "PosItemView",
    ]) expect(source, view).toContain(`<${view}`);
  });

  it("maps every live POS route to its inventory screen", () => {
    const routes = new Map(SCREEN_ROUTES.map((route) => [route.name, route.file]));
    expect(Object.fromEntries([...routes].filter(([name]) => [
      "Point of sale", "Connect Square", "Square locations", "Square → QuickBooks connector",
      "Disconnect Square", "POS mapping", "POS sale detail", "Menu", "POS item",
    ].includes(name)))).toEqual({
      "Point of sale": "app/(app)/settings/pos/page.tsx",
      "Connect Square": "app/(app)/settings/pos/connect/page.tsx",
      "Square locations": "app/(app)/settings/pos/locations/page.tsx",
      "Square → QuickBooks connector": "app/(app)/settings/pos/connector/page.tsx",
      "Disconnect Square": "app/(app)/settings/pos/disconnect/page.tsx",
      "POS mapping": "app/(app)/settings/pos/mapping/page.tsx",
      "POS sale detail": "app/(app)/settings/pos/sales/[id]/page.tsx",
      Menu: "app/(app)/menu/page.tsx",
      "POS item": "app/(app)/menu/item/[formatId]/page.tsx",
    });
  });
});
