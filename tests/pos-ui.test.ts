// Program 14 P5: POS screens share their inventory/live presentation, and an
// uncertain provider response keeps one retryable identity without claiming success.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PosItemView, PosMappingView, PosMenuView } from "@/components/mgr/views/pos";
import { SCREENS } from "@/components/mgr/screens";
import { classifyCommandFailure } from "@/lib/commands/client";
import { isTerminalPublication, publicationNotice, readPublicationOutcome, reconcileBooleanChange, selectExactCommandAttempt, shouldStartNewCommandAttempt, syncFailureMessage, syncResultMessage, toPosMenuSetup } from "@/lib/mgr/pos-view";
import { navFor, shippedNav, STAFF_NAV } from "@/lib/mgr/nav";
import { SCREEN_ROUTES } from "@/lib/mgr/screen-routes";

describe("POS UI truth", () => {
  it("uses explicit destinations instead of a live rendering mode", () => {
    expect(readFileSync("components/mgr/views/pos.tsx", "utf8")).not.toMatch(/\blive\b/);
    expect(readFileSync("components/mgr/views/pos-controls.tsx", "utf8")).not.toMatch(/\blive\b/);
  });
  it("freezes corrected publication input for an exact retry after an unknown result", () => {
    const corrected = selectExactCommandAttempt(null, { name: "publish_pos_item", input: {
      posLocationId: "L1", brandId: "brand-1", retryConflict: true,
    } }, true, () => "corrected-request");
    const retry = selectExactCommandAttempt(corrected, { name: "publish_pos_item", input: {
      posLocationId: "L1", brandId: "brand-1",
    } }, false, () => "must-not-run");
    expect(retry).toEqual(corrected);
    expect(retry).toMatchObject({ requestId: "corrected-request", input: { retryConflict: true } });
  });

  it("renders superseded sync as incomplete while accepting a confirmed empty catalog", () => {
    expect(syncResultMessage("Catalog", { locations: 1, variations: 0 }, "empty-ok")).toBe("Catalog sync complete · attempt empty-ok");
    expect(syncResultMessage("Catalog", { synced: false }, "incomplete")).toBeNull();
    const superseded = syncResultMessage("Catalog", { synced: false, superseded: true, errorCode: "connection_changed" }, "stale")!;
    expect(superseded).toContain("Catalog sync superseded · attempt stale");
    expect(superseded).toContain("not refreshed");
    expect(superseded).not.toContain("sync complete");
  });

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

  it("consumes the durable publication command envelope instead of inventing status", () => {
    expect(readPublicationOutcome({ publication: { attemptId: "attempt-ok", status: "succeeded", errorCode: null } }))
      .toEqual({ attemptId: "attempt-ok", status: "succeeded", errorCode: null });
    expect(readPublicationOutcome({ publication: { attemptId: "attempt-bad", status: "rejected", errorCode: "version_mismatch" } }))
      .toEqual({ attemptId: "attempt-bad", status: "rejected", errorCode: "version_mismatch" });
    expect(readPublicationOutcome({ publication: { attemptId: "attempt-old", status: "superseded", errorCode: "connection_changed" } }))
      .toEqual({ attemptId: "attempt-old", status: "superseded", errorCode: "connection_changed" });
    expect(readPublicationOutcome({ published: true })).toBeNull();
  });

  it("separates definitive command refusal from uncertain transport failure", () => {
    const permission = classifyCommandFailure(Object.assign(new Error("permission denied"), { status: 403, code: "permission_denied" }));
    const conflict = classifyCommandFailure(Object.assign(new Error("conflict"), { status: 409, code: "conflict" }));
    const unknown = classifyCommandFailure(new TypeError("fetch failed"));
    expect(permission).toMatchObject({ kind: "definitive", status: 403, code: "permission_denied" });
    expect(conflict).toMatchObject({ kind: "definitive", status: 409, code: "conflict" });
    expect(unknown).toMatchObject({ kind: "unknown" });
    expect(syncFailureMessage("Sales", permission, "request-known")).toBe("Sales sync stopped · permission denied. Resolve the permission or conflict, then start a new sync.");
    expect(syncFailureMessage("Sales", unknown, "request-unknown")).toContain("attempt request-unknown. Retry the exact attempt");
    expect(shouldStartNewCommandAttempt(null, permission)).toBe(true);
    expect(shouldStartNewCommandAttempt(null, unknown)).toBe(false);
  });

  it("rolls an optimistic boolean back when persistence fails", async () => {
    const states: boolean[] = [];
    await reconcileBooleanChange(false, true, async () => false, value => states.push(value));
    expect(states).toEqual([true, false]);
    states.length = 0;
    await reconcileBooleanChange(false, true, async () => true, value => states.push(value));
    expect(states).toEqual([true]);
  });

  it("keeps an all-out-of-stock owned menu publishable and its item reachable", () => {
    const model = { locations: [{ id: "taproom", label: "Taproom" }], selectedLocationId: "taproom", locationName: "Taproom",
      binName: "Cold", channelName: "Taproom", items: [], externalItems: [],
      excluded: [{ brandId: "hazy", formatId: "pint", label: "Hazy · Pint", retail: "$7.00", source: "format", destinations: "Square", available: false, reason: "out of stock", href: "#" }] };
    const menu = renderToStaticMarkup(createElement(PosMenuView, { model }));
    expect(menu).toContain("Publish changes");
    expect(menu).not.toMatch(/<button[^>]*disabled=""[^>]*>Publish changes/);
    // The excluded item only navigates: a row link, not an Open verb (#1026).
    expect(menu).toMatch(/<a[^>]*href="#"[^>]*>(?:(?!<\/a>)[\s\S])*Hazy · Pint/);
    expect(menu).not.toMatch(/>Open</);
    const item = renderToStaticMarkup(createElement(PosItemView, { item: { brand: "Hazy", format: "Pint", sources: "", serving: "16 oz", price: "$7.00", override: "", websitePublished: false, available: false } }));
    expect(item).not.toMatch(/<button[^>]*disabled=""[^>]*>Publish item to Square/);
  });

  it("renders the inventory sync and sale-opening action contract", () => {
    const html = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find(screen => screen.name === name)!.body));
    expect(html("Point of sale")).toMatch(/Sync Square catalog[\s\S]*Sync Square sales/);
    expect(html("POS mapping")).toMatch(/Sync Square catalog[\s\S]*Sync Square sales/);
    // A recent sale opens by its row arrow, not an Open verb (#1026).
    const saleRow = html("POS mapping").split('data-slot="item"').find(item => item.includes("Sale · Hazy IPA · pint"));
    expect(saleRow).toContain('aria-label="Open"');
    expect(html("POS mapping")).not.toMatch(/>Open</);
  });

  it("a live menu item and a live sale are row links to their detail (#1026)", () => {
    const model = { locations: [], selectedLocationId: "taproom", locationName: "Taproom", binName: "Cold", channelName: "Taproom", externalItems: [], excluded: [],
      items: [{ brandId: "hazy", formatId: "pint", label: "Hazy · Pint", retail: "$7.00", source: "format", destinations: "Square", available: true, href: "/menu/item/pint" }] };
    const menu = renderToStaticMarkup(createElement(PosMenuView, { model }));
    expect(menu).toMatch(/<a[^>]*href="\/menu\/item\/pint"[^>]*>(?:(?!<\/a>)[\s\S])*Hazy · Pint/);
    expect(menu).not.toMatch(/>Open</);
    const mapping = renderToStaticMarkup(createElement(PosMappingView, { variations: [], targets: [], coverage: [],
      sales: [{ id: "s", label: "Sale · Hazy", detail: "1 pint", amount: "$7.00", status: "mapped", href: "/settings/pos/sales/s" }] }));
    expect(mapping).toMatch(/<a[^>]*href="\/settings\/pos\/sales\/s"[^>]*>(?:(?!<\/a>)[\s\S])*Sale · Hazy/);
    expect(mapping).not.toMatch(/>Open</);
  });

  it("keeps live POS route sheets on the inventory body layout", () => {
    expect(readFileSync("components/mgr/views/pos-controls.tsx", "utf8"))
      .toContain('<div className="flex flex-col gap-2">{children}</div>');
  });

  it("gives Warehouse a direct route to POS mapping and retained sales", () => {
    expect(navFor(shippedNav(STAFF_NAV), ["warehouse"]).find(item => item.label === "More")?.children)
      .toEqual(expect.arrayContaining([expect.objectContaining({ label: "POS mapping", href: "/settings/pos/mapping" })]));
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

describe("Menu with no mapped Square location (#997)", () => {
  const unmapped = (setup: Parameters<typeof toPosMenuSetup>[0]) => renderToStaticMarkup(createElement(PosMenuView, {
    model: { locations: [], selectedLocationId: "", locationName: "Square location", items: [], excluded: [], externalItems: [], setup: toPosMenuSetup(setup) },
  }));

  it.each([0, 2])("sends an admin to connect Square when it is not connected, even with %i leftover locations (#1039)", (observed) => {
    const html = unmapped({ admin: true, connected: false, observed });
    expect(html).toContain("Connect Square, then map a Square location");
    expect(html).toMatch(/href="\/settings\/pos"[^>]*>Set up Square/);
    expect(html).not.toContain("none is mapped");
    expect(html).not.toContain("Also in Square");
    expect(html).not.toContain("One catalog");
    expect(html).not.toContain("No mapped Square location is available.");
  });

  it("draws the setup action inside the empty state, under its message (#1020 review)", () => {
    const html = unmapped({ admin: true, connected: false, observed: 0 });
    expect(html).toMatch(/data-slot="empty-content"[^>]*>(?:(?!<\/div>)[\s\S])*Set up Square/);
  });

  it("tells an admin that a connected Square has synced no locations yet, not that some were found (#1082 review)", () => {
    const html = unmapped({ admin: true, connected: true, observed: 0 });
    expect(html).toContain("Square is connected, but no locations are synced yet");
    expect(html).not.toContain("were found");
    expect(html).toMatch(/href="\/settings\/pos"[^>]*>Set up Square/);
  });

  it("sends an admin to map a location when Square is connected and its locations synced", () => {
    const html = unmapped({ admin: true, connected: true, observed: 2 });
    expect(html).not.toContain("Connect Square");
    expect(html).toContain("none is mapped to an MGR location");
    expect(html).toMatch(/href="\/settings\/pos\/locations"[^>]*>Map Square locations/);
  });

  it("tells a non-admin that Square is disconnected, with no settings link (#1083)", () => {
    const html = unmapped({ admin: false, connected: false, observed: 2 });
    expect(html).toMatch(/Square isn’t connected<\/[^>]+>(?:(?!Square isn’t)[\s\S])*Ask an admin to reconnect it\./);
    expect(html).not.toContain("were found");
    expect(html).not.toContain("/settings/pos");
    expect(html).not.toContain("Set up Square");
  });

  it("tells a non-admin that a connected Square has unmapped locations (#1083)", () => {
    const html = unmapped({ admin: false, connected: true, observed: 2 });
    expect(html).toContain("Square locations were found, but none is mapped to an MGR location. Ask an admin to map one.");
    expect(html).not.toContain("/settings/pos");
    expect(html).not.toContain("Map Square locations");
  });

  it("tells a non-admin that a connected Square has synced no location yet (#1083)", () => {
    const html = unmapped({ admin: false, connected: true, observed: 0 });
    expect(html).toContain("Square is connected, but no locations are synced yet. Ask an admin to sync and map one.");
    expect(html).not.toContain("/settings/pos");
  });

  it("reads the connection through get_square_connected for every role (#1083)", () => {
    const page = readFileSync("app/(app)/menu/page.tsx", "utf8");
    expect(page).toContain('runCommand("get_square_connected"');
    expect(page).not.toContain("get_pos_integration_health");
  });

  it("keeps the live settings path out of the shared view and inert in the inventory frames", () => {
    expect(readFileSync("components/mgr/views/pos.tsx", "utf8")).not.toContain("/settings/pos\"");
    for (const name of ["Menu setup", "Menu unmapped"]) {
      const html = renderToStaticMarkup(createElement("div", null, SCREENS.find(screen => screen.name === name)!.body));
      expect(html, name).not.toContain("/settings/pos");
    }
  });
});
