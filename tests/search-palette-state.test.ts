import { describe, expect, it } from "vitest";
import { searchCacheKey, searchLoading, pickerHits } from "@/lib/mgr/search-palette-state";

describe("search palette state", () => {
  it("scopes cached matches to brewery, kinds, and term", () => {
    expect(searchCacheKey("brewery-1", ["sku"], " Hazy ")).toBe("mgr-search:brewery-1:sku:hazy");
    expect(searchCacheKey("brewery-1", undefined, "ORD-0001")).toBe("mgr-search:brewery-1:all:ord-0001");
  });

  it("clearing an in-flight search restores the initial list", () => {
    expect(searchLoading("", "hazy", "loading")).toBe(false);
    expect(searchLoading("pils", "hazy", "ready")).toBe(true);
    expect(searchLoading("hazy", "hazy", "ready")).toBe(false);
  });

  it("only offers current picker options and avoids duplicate recent rows", () => {
    const hit = { kind: "sku" as const, id: "sku-1", label: "Hazy", detail: "half keg", href: "/catalog", exact: false };
    const removed = { ...hit, id: "removed" };
    expect(pickerHits([hit, removed], [hit])).toEqual([hit]);
    expect(pickerHits([hit], [hit], [hit])).toEqual([]);
    expect(pickerHits([hit, removed])).toEqual([hit, removed]);
  });
});
