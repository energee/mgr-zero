import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
import CatalogSkusPage from "@/app/(app)/catalog/skus/page";
import NewCatalogSkuPage from "@/app/(app)/catalog/skus/new/page";

it.each([CatalogSkusPage, NewCatalogSkuPage])("redirects named SKU URLs to the brand-first Catalog flow", page => {
  expect(page).toThrow("redirect:/catalog");
});
