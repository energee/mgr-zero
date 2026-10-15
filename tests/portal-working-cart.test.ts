// Browser-persistent working cart (#710): the unsaved Shop cart survives a
// reload or navigation in localStorage, scoped to one buyer, customer account
// and brewery, for at most seven days.
import { describe, expect, it } from "vitest";

import { clearWorkingCart, restoreWorkingCart, saveWorkingCart, WORKING_CART_TTL_MS, workingCartKey } from "@/lib/portal-cart";

const scope = { actorId: "00000000-0000-4000-8000-000000000001", customerId: "00000000-0000-4000-8000-000000000002", breweryId: "00000000-0000-4000-8000-000000000003" };
const items = [{ skuId: "sku-ipa", name: "IPA 1/2 bbl" }, { skuId: "sku-lager", name: "Lager 1/6 bbl" }];
const shipTos = [{ id: "ship-1" }, { id: "ship-2" }];
const fields = { shipToId: "ship-2", poNumber: "PO-7", note: "Back door", requestedShipDate: "2026-10-20" };
const NOW = 1_800_000_000_000;

function memory() {
  const values = new Map<string, string>();
  return { values, storage: () => ({ getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v), removeItem: (k: string) => void values.delete(k) }) };
}

describe("portal working cart (#710)", () => {
  it("round-trips fields and raw quantities", () => {
    const { storage } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3", "sku-lager": "" } }, items, NOW);
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW + 1000)).toEqual({ fields, qty: { "sku-ipa": "3" }, removed: [] });
  });

  it("is scoped to buyer, customer account and brewery", () => {
    const { storage } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3" } }, items, NOW);
    expect(restoreWorkingCart(storage, { ...scope, customerId: "00000000-0000-4000-8000-000000000009" }, items, shipTos, NOW)).toBeNull();
    expect(restoreWorkingCart(storage, { ...scope, actorId: "00000000-0000-4000-8000-000000000009" }, items, shipTos, NOW)).toBeNull();
    expect(restoreWorkingCart(storage, { ...scope, breweryId: "00000000-0000-4000-8000-000000000009" }, items, shipTos, NOW)).toBeNull();
    expect(workingCartKey(scope)).toBe(`mgr-portal-cart:${scope.actorId}:${scope.customerId}:${scope.breweryId}`);
  });

  it("expires after seven days and removes the stale entry", () => {
    const { storage, values } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3" } }, items, NOW);
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW + WORKING_CART_TTL_MS)).not.toBeNull();
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW + WORKING_CART_TTL_MS + 1)).toBeNull();
    expect(values.size).toBe(0);
  });

  it("clears the saved cart", () => {
    const { storage, values } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3" } }, items, NOW);
    clearWorkingCart(storage, scope);
    expect(values.size).toBe(0);
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW)).toBeNull();
  });

  it("drops packages no longer in the catalog and returns their names", () => {
    const { storage } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3", "sku-lager": "2" } }, items, NOW);
    expect(restoreWorkingCart(storage, scope, [items[0]], shipTos, NOW)).toEqual({ fields, qty: { "sku-ipa": "3" }, removed: ["Lager 1/6 bbl"] });
  });

  it("falls back to the default ship-to when the saved one is gone", () => {
    const { storage } = memory();
    saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3" } }, items, NOW);
    expect(restoreWorkingCart(storage, scope, items, [{ id: "ship-1", is_default: true }], NOW)?.fields.shipToId).toBe("ship-1");
  });

  it("treats unreadable contents as no saved cart", () => {
    const { storage, values } = memory();
    values.set(workingCartKey(scope), "{not json");
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW)).toBeNull();
    values.set(workingCartKey(scope), JSON.stringify({ savedAt: NOW, lines: "nope" }));
    expect(restoreWorkingCart(storage, scope, items, shipTos, NOW)).toBeNull();
  });

  it("never throws when storage is missing or throws", () => {
    const missing = () => { throw new ReferenceError("localStorage is not defined"); };
    const broken = () => ({ getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("denied"); } });
    for (const storage of [missing, broken]) {
      expect(() => saveWorkingCart(storage, scope, { fields, qty: { "sku-ipa": "3" } }, items, NOW)).not.toThrow();
      expect(restoreWorkingCart(storage, scope, items, shipTos, NOW)).toBeNull();
      expect(() => clearWorkingCart(storage, scope)).not.toThrow();
    }
  });
});
