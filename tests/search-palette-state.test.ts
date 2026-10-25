import { Children, createElement, isValidElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { searchCacheKey, searchLoading, restrictToOptions, excludeSeen, searchDestinations, searchEmptyMessage } from "@/lib/mgr/search-palette-state";
import { Palette } from "@/components/mgr/palette";
import { SearchView } from "@/components/mgr/views/search";
import { CommandInput } from "@/components/ui/command";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/mgr/search-view";

function searchInput(value: string, onValueChange: (value: string) => void) {
  const view = SearchView({ model: { placeholder: "Search", groups: [] }, value, onValueChange });
  const palette = Children.toArray(view.props.children).find(node => isValidElement(node) && node.type === Palette) as ReactElement<ComponentProps<typeof Palette>>;
  expect(palette).toBeDefined();
  const input = Palette(palette.props).props.children[0] as ReactElement<ComponentProps<typeof CommandInput>>;
  expect(input.type).toBe(CommandInput);
  return input.props;
}

describe("shared search input boundary (#1296)", () => {
  it("puts the existing 80-character cap on the actual inventory and controlled input", () => {
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(80);
    for (const controls of [{}, { value: "", onValueChange: vi.fn() }]) {
      const html = renderToStaticMarkup(createElement(SearchView, {
        model: { placeholder: "Search", groups: [] }, ...controls,
      }));
      expect(html).toMatch(/<input\b[^>]*maxLength="80"/i);
    }
  });

  it.each([79, 80, 81, 200])("bounds a %i-character callback value before it reaches search state", length => {
    const onValueChange = vi.fn();
    const input = searchInput("", onValueChange);
    const pasted = "a".repeat(length);
    input.onValueChange!(pasted);
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(pasted.slice(0, 80));
  });

  it("bounds controlled values and preserves spaces, punctuation, case, and clearing", () => {
    const onValueChange = vi.fn();
    expect(searchInput("a".repeat(81), onValueChange).value).toBe("a".repeat(80));
    const input = searchInput("", onValueChange);
    input.onValueChange!("  Wild*Card (IPA)  ");
    input.onValueChange!("");
    expect(onValueChange.mock.calls).toEqual([["  Wild*Card (IPA)  "], [""]]);
  });
});

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
  for (const status of ["loading", "error", "offline"] as const) expect(searchEmptyMessage("zzz", status, true)).toBe("");
});
