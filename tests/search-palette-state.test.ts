import { describe, expect, it } from "vitest";
import { searchCacheKey, searchLoading, restrictToOptions, excludeSeen, searchDestinations, searchEmptyMessage } from "@/lib/mgr/search-palette-state";

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
    expect(restrictToOptions([hit, removed], [hit])).toEqual([hit]);
    expect(excludeSeen(restrictToOptions([hit], [hit]), [hit])).toEqual([]);
    expect(restrictToOptions([hit, removed])).toEqual([hit, removed]);
  });
});


it("finds role-visible pages independently of record matches", () => {
  expect(searchDestinations(["admin"], " invoice ").map(page => page.href)).toEqual(["/invoices"]);
  expect(searchDestinations(["sales"], "CATALOG").map(page => page.href)).toEqual(["/catalog"]);
  expect(searchDestinations(["brewer"], "catalog")).toEqual([]);
  expect(searchDestinations(["sales"], "locations")).toEqual([]);
  expect(searchDestinations(["admin"], "")).toEqual([]);
  expect(searchDestinations(["admin"], "nothing matches")).toEqual([]);
});

it("hints before the first term and reports a finished empty search, with page wording only when pages are searched (#1106)", () => {
  expect(searchEmptyMessage("", "idle", true)).toBe("Type a page name, record name, or document number.");
  expect(searchEmptyMessage("", "idle", false)).toBe("Type a record name or number.");
  expect(searchEmptyMessage("zzz", "ready", true)).toBe("No pages or records found · Try a page name, record name, or document number.");
  expect(searchEmptyMessage("zzz", "ready", false)).toBe("No records found · Try a record name or number.");
  for (const status of ["loading", "error", "offline"]) expect(searchEmptyMessage("zzz", status, true)).toBe("");
});
