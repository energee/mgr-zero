import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Render the hydrated cart: the server snapshot would only show the loading note.
vi.mock("react", async importOriginal => ({ ...await importOriginal<typeof import("react")>(), useSyncExternalStore: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { Cart, submissionFailureMessage } from "@/app/(portal)/portal/cart";
import { cartActionsDisabled, cartMissingInput, planDraftSync, workingCartKey } from "@/lib/portal-cart";

describe("portal cart recovery", () => {
  it("does not claim an order is still a draft when submission may have committed", () => {
    expect(submissionFailureMessage("network failed", "order-id")).toBe(
      "Order saved, but submission could not be confirmed (network failed). View the order status before retrying, or contact the brewery.",
    );
    expect(submissionFailureMessage("network failed", null)).toBe("network failed");
  });
});

describe("portal cart draft sync", () => {
  it("creates a draft when none exists yet", () => {
    expect(planDraftSync(null)).toEqual({ command: "portal_create_order" });
  });

  it("replaces the saved draft's lines when a draft already exists, never reusing stale lines", () => {
    expect(planDraftSync("order-id")).toEqual({ command: "portal_update_draft_order", orderId: "order-id" });
  });

  it("disables both buttons without a ship-to, without a positive line, or while busy — even with a saved draft", () => {
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 1, busy: false })).toBe(false);
    expect(cartActionsDisabled({ shipToId: "", lineCount: 1, busy: false })).toBe(true);
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 0, busy: false })).toBe(true);
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 1, busy: true })).toBe(true);
  });
});

describe("portal cart disabled reason (#768)", () => {
  it("names the missing ship-to and quantity that keep Save draft and Review order disabled", () => {
    expect(cartMissingInput({ shipToId: "s", lineCount: 1 })).toBeNull();
    expect(cartMissingInput({ shipToId: "", lineCount: 1 })).toBe("Before saving or reviewing this order, choose a ship-to.");
    expect(cartMissingInput({ shipToId: "s", lineCount: 0 })).toBe("Before saving or reviewing this order, enter a quantity above zero.");
    expect(cartMissingInput({ shipToId: "", lineCount: 0 })).toBe("Before saving or reviewing this order, choose a ship-to and enter a quantity above zero.");
  });
});

describe("portal cart messages (#904)", () => {
  const scope = { actorId: crypto.randomUUID(), customerId: crypto.randomUUID(), breweryId: crypto.randomUUID() };
  const shipTo = crypto.randomUUID();
  const items = [{ skuId: crypto.randomUUID(), name: "Pils Keg", product: "Pils", unitPriceCents: 100 }];
  const alerts = (html: string) => [...html.matchAll(/<div\b[^>]*role="alert"[^>]*>([\s\S]*?)<\/div>/g)].map(match => match[1].replace(/<[^>]+>/g, "")).join(" · ");
  function render(qty: string) {
    const saved = JSON.stringify({ savedAt: Date.now(), fields: { shipToId: shipTo, poNumber: "", note: "", requestedShipDate: null }, lines: [{ skuId: items[0].skuId, name: "Pils Keg", qty }, { skuId: "gone", name: "Old IPA", qty: "1" }] });
    vi.stubGlobal("sessionStorage", { getItem: () => null });
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === workingCartKey(scope) ? saved : null, setItem: () => {}, removeItem: () => {} });
    return renderToStaticMarkup(createElement(Cart, { customerName: "River Market", items, shipTos: [{ id: shipTo, label: "Dock", country: "US" }], scope, fulfillmentSource: { id: "source", name: "Brewery" } }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it("announces quantity and missing-input validation, and the removed-items change, as alerts", () => {
    const invalid = alerts(render("1.5"));
    expect(invalid).toContain("Enter whole quantities of zero or more.");
    expect(invalid).toContain("Removed unavailable or unpriced items: Old IPA");
    expect(alerts(render("0"))).toContain("Before saving or reviewing this order, enter a quantity above zero.");
  });
});
