// tests/brand-reference-view.test.ts — the portal brand reference sheet shows
// only the facts the brewery set, and links a COLA to TTB's public registry
// through the staff COLA link (colaUrl), never a second URL builder.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandReferenceView } from "../components/mgr/views/brand-reference";
import { toBrandReference, type PortalBrand } from "../lib/mgr/brand-reference-view";
import { colaUrl } from "../lib/mgr/brand-approval-view";

const full: PortalBrand = { brandId: "b1", name: "Rose Quartz", alias: "Mineral #7", style: "Pilsner", abv: 5.2, description: "A crisp, dry pilsner.", hops: "Saaz, Hallertau", ttbId: "26001001000777", hasLabel: true };
const bare: PortalBrand = { brandId: "b2", name: "Hazy IPA", alias: null, style: null, abv: null, description: null, hops: null, ttbId: null, hasLabel: false };

describe("toBrandReference", () => {
  it("shows every fact the brewery set, and links the COLA to its TTB registry page", () => {
    expect(toBrandReference(full)).toEqual({
      brandId: "b1", title: "Rose Quartz", alias: "Mineral #7", hasLabel: true,
      tagline: "Pilsner · 5.2% ABV", hops: "Saaz, Hallertau",
      description: "A crisp, dry pilsner.",
      cola: { ttbId: "26001001000777", href: colaUrl("26001001000777") },
    });
  });

  it("leaves out every fact that is not set", () => {
    expect(toBrandReference(bare)).toEqual({ brandId: "b2", title: "Hazy IPA", hasLabel: false });
  });

  it("keeps a TTB id that is not a valid COLA id as text, with no link", () => {
    expect(toBrandReference({ ...bare, ttbId: "12" }).cola).toEqual({ ttbId: "12", href: null });
  });
});

describe("BrandReferenceView", () => {
  it("draws the image slot, one alias · style · ABV line, description, hops, the order slot and the registry link", () => {
    const html = renderToStaticMarkup(createElement(BrandReferenceView, { model: toBrandReference(full), image: createElement("i", null, "label"), order: createElement("b", null, "formats") }));
    expect(html).toContain("Mineral #7 · Pilsner · 5.2% ABV");
    expect(html).toContain("Saaz, Hallertau");
    expect(html).toContain("<b>formats</b>");
    expect(html).toContain("Label approval (TTB)");
    expect(html).toContain("<i>label</i>");
    expect(html).toContain("Mineral #7");
    expect(html).toContain("5.2%");
    expect(html).toContain("A crisp, dry pilsner.");
    expect(html).toMatch(/<a [^>]*href="https:\/\/ttbonline\.gov\/colasonline\/viewColaDetails\.do\?action=publicFormDisplay&amp;ttbid=26001001000777"[^>]*target="_blank"[^>]*>26001001000777/);
  });

  it("says so when the brewery has shared nothing more", () => {
    expect(renderToStaticMarkup(createElement(BrandReferenceView, { model: toBrandReference(bare) }))).toContain("No more details from the brewery yet.");
  });
});
