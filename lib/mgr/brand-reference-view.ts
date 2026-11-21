// lib/mgr/brand-reference-view.ts — the portal brand reference sheet: what a
// buyer sees on tapping a brand heading on Shop or an order (portal_brands).
// Only facts the brewery set appear; a COLA links to TTB's public registry
// through colaUrl, the link staff Compliance uses.
import { colaUrl } from "./brand-approval-view";

/** One portal_brands row. */
export type PortalBrand = {
  brandId: string; name: string; alias: string | null; style: string | null; abv: number | null;
  description: string | null; hops: string | null; ttbId: string | null; hasLabel: boolean;
};

export type BrandReferenceModel = {
  brandId: string;
  title: string;
  alias?: string;
  /** "Pilsner · 5.2% ABV": style and ABV, whichever is set. */
  tagline?: string;
  hops?: string;
  description?: string;
  /** The brand's COLA; href is null when the id is not a valid TTB id, so it reads as text. */
  cola?: { ttbId: string; href: string | null };
  /** MGR holds the label image; the live sheet loads it with portal_cola_label_image. */
  hasLabel: boolean;
};

/** A brand's style and ABV on one line ("Pilsner · 5.2% ABV"), or "" when neither is set. Shop cards and the reference sheet both read it. */
export function brandTagline(b: Pick<PortalBrand, "style" | "abv">): string {
  return [b.style, b.abv !== null ? `${b.abv}% ABV` : null].filter(Boolean).join(" · ");
}

export function toBrandReference(b: PortalBrand): BrandReferenceModel {
  const tagline = brandTagline(b);
  return {
    brandId: b.brandId, title: b.name, ...(b.alias ? { alias: b.alias } : {}), hasLabel: b.hasLabel,
    ...(tagline ? { tagline } : {}), ...(b.hops ? { hops: b.hops } : {}),
    ...(b.description ? { description: b.description } : {}),
    ...(b.ttbId ? { cola: { ttbId: b.ttbId, href: colaUrl(b.ttbId) } } : {}),
  };
}
