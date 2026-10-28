// tests/list-params.test.ts — a list page's URL params: typed, defaulted, and rebuilt into links.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listParams, SEARCH_MAX, searchQuery } from "@/lib/mgr/list-params";

const schema = z.object({
  q: searchQuery,
  sort: z.enum(["name", "abv"]).catch("name"),
  category: z.string().catch(""),
});

describe("listParams", () => {
  it("defaults every missing param", () => {
    expect(listParams(schema, {}).params).toEqual({ q: "", sort: "name", category: "" });
  });
  it("falls back on one bad param without losing the others", () => {
    expect(listParams(schema, { q: " hazy ", sort: "bogus" }).params).toEqual({ q: "hazy", sort: "name", category: "" });
  });
  it("cuts an over-long search to its first SEARCH_MAX characters instead of dropping it", () => {
    expect(listParams(schema, { q: "a".repeat(300) }).params.q).toBe("a".repeat(SEARCH_MAX));
  });
  it("treats a whitespace-only search as no search", () => {
    expect(listParams(schema, { q: "   " }).params.q).toBe("");
  });
  it("takes the first value of a repeated param", () => {
    expect(listParams(schema, { sort: ["abv", "name"] }).params.sort).toBe("abv");
  });
  it("hrefWith keeps the other params and drops defaults and empties", () => {
    const { hrefWith } = listParams(schema, { q: "hazy", sort: "abv" });
    expect(hrefWith("/catalog", { category: "Core" })).toBe("/catalog?q=hazy&sort=abv&category=Core");
    expect(hrefWith("/catalog", { sort: "name" })).toBe("/catalog?q=hazy");
    expect(hrefWith("/catalog", { q: "", sort: "name" })).toBe("/catalog");
  });
  it("queryWith gives the same params as entries, for a form's hidden inputs", () => {
    const { queryWith } = listParams(schema, { q: "hazy", sort: "abv", category: "Core" });
    expect(Object.fromEntries(queryWith({ q: "" }))).toEqual({ sort: "abv", category: "Core" });
  });
});
