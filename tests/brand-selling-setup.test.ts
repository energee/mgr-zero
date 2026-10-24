import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandView } from "@/components/mgr/views/brand";
import { toBrandViewProps } from "@/lib/mgr/brand-view";
import { toCatalogViewProps } from "@/lib/mgr/catalog-view";
import { brandHazy } from "@/lib/mgr/fixtures/catalog";

const emptyBrand = { ...brandHazy.brand, price_group_id: null, skus: [], pours: [] };

function brandHtml(formats = brandHazy.sells!.formats) {
  return renderToStaticMarkup(createElement(BrandView, {
    model: toBrandViewProps({ ...brandHazy, brand: emptyBrand, sells: { formats, prices: [], channels: [] } }),
  }));
}

describe("Brand selling setup", () => {
  it("offers format setup without SKU switches or pricing when no formats exist", () => {
    const html = brandHtml([]);
    expect(html).toContain("Manage formats");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Edit on price group");
  });

  it("offers eligible off switches without claiming an existing SKU", () => {
    const html = brandHtml();
    expect(html).toContain('aria-label="Sells as Half"');
    expect(html).not.toContain("Edit SKU");
  });

  it("retains pricing access when the saved group has no pours", () => {
    const html = renderToStaticMarkup(createElement(BrandView, {
      model: toBrandViewProps({ ...brandHazy, brand: { ...brandHazy.brand, pours: [] } }),
      linkRows: true,
    }));
    expect(html).toContain('href="/pricing"');
  });

  it("does not offer unauthorized format or pricing actions", () => {
    const html = renderToStaticMarkup(createElement(BrandView, {
      model: toBrandViewProps(brandHazy), formatAction: null, linkRows: false, sellsDisabled: true,
    }));
    expect(html).not.toContain("Manage formats");
    expect(html).not.toContain("Edit on price group");
    const switches = html.match(/<button[^>]*role="switch"[^>]*>/g)!;
    expect(switches).toHaveLength(4);
    for (const control of switches) expect(control).toContain("disabled");
  });

  it("keeps pricing setup tied to the saved group until Save brand", () => {
    const model = toBrandViewProps({ ...brandHazy, saved: emptyBrand });
    expect(model.sells.unpriced).toBe(true);
    expect(model.sells.packages.every(row => row.prices === "Unpriced")).toBe(true);
  });

  it("counts only saved packaged SKU records, not pours or eligible formats", () => {
    const brand = { ...emptyBrand, colas: [], pours: [{ id: "pour" }] };
    expect(toCatalogViewProps({ brands: [brand], priceGroups: [] }).brands[0]!.skus).toBe("0");
    const inactive = { id: "inactive", active: false };
    const active = { id: "active", active: true };
    expect(toCatalogViewProps({ brands: [{ ...brand, skus: [inactive] }], priceGroups: [] }).brands[0]!.skus).toBe("1");
    expect(toCatalogViewProps({ brands: [{ ...brand, skus: [inactive, active] }], priceGroups: [] }).brands[0]!.skus).toBe("2");
  });
});
