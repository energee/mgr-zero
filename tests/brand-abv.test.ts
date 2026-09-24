// tests/brand-abv.test.ts — #489: brand ABV is bounded in upsert_brand's schema
// (0 to numeric(4,2)'s 99.99) and drawn with the shared numeric stepper. Pure:
// the schema is parsed directly and the view rendered to markup; no database.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getCommandDefinition } from "../lib/commands/registry";
import "../lib/commands/all";
import { BrandView } from "../components/mgr/views/brand";
import { brandHazy } from "../lib/mgr/fixtures/catalog";
import { toBrandViewProps } from "../lib/mgr/brand-view";

const input = getCommandDefinition("upsert_brand")!.input;
const parse = (abv: unknown) => input.safeParse({ name: "NEIPA", abv });
const message = (abv: unknown) => {
  const parsed = parse(abv);
  return parsed.success ? "" : z.prettifyError(parsed.error);
};

describe("upsert_brand ABV (#489)", () => {
  it("accepts 0 through 99.99 and an omitted ABV", () => {
    for (const abv of [0, 5.1, 99.99, undefined]) expect(parse(abv).success).toBe(true);
  });

  it("rejects a negative ABV with a readable message", () => {
    expect(parse(-5).success).toBe(false);
    expect(message(-5)).toMatch(/ABV.*0.*99\.99/);
  });

  it("rejects an ABV the numeric(4,2) column cannot hold instead of overflowing to a 500", () => {
    expect(parse(150).success).toBe(false);
    expect(message(150)).toMatch(/ABV.*0.*99\.99/);
  });

  it("rejects a non-number (NaN from a typed word) as not a number", () => {
    expect(parse(Number.NaN).success).toBe(false);
  });
});

describe("Brand view ABV field", () => {
  it("is the shared numeric stepper bounded 0 to 99.99, not a text box", () => {
    const html = renderToStaticMarkup(createElement(BrandView, { model: toBrandViewProps(brandHazy) }));
    const abvInput = html.match(/<input[^>]*aria-label="ABV"[^>]*>/)?.[0] ?? "";
    expect(abvInput).toContain('type="number"');
    expect(abvInput).toContain('min="0"');
    expect(abvInput).toContain('max="99.99"');
    expect(html).toContain('aria-label="Increase"');
  });
});
