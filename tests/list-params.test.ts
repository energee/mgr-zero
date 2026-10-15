// tests/list-params.test.ts — a list page's URL params: typed, defaulted, and rebuilt into links.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listParams } from "@/lib/mgr/list-params";

const schema = z.object({
  q: z.string().trim().max(100).catch(""),
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
  it("takes the first value of a repeated param", () => {
    expect(listParams(schema, { sort: ["abv", "name"] }).params.sort).toBe("abv");
  });
  it("hrefWith keeps the other params and drops defaults and empties", () => {
    const { hrefWith } = listParams(schema, { q: "hazy", sort: "abv" });
    expect(hrefWith("/catalog", { category: "Core" })).toBe("/catalog?q=hazy&sort=abv&category=Core");
    expect(hrefWith("/catalog", { sort: "name" })).toBe("/catalog?q=hazy");
    expect(hrefWith("/catalog", { q: "", sort: "name" })).toBe("/catalog");
  });
});
