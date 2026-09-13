// lib/mgr/brand-view.ts — view-model for Brand detail. list_brands (one row)
// plus list_price_groups, the brewery's styles, and the brand's rows from
// get_compliance_registry paint BrandView.
import type { BrandRecipeCost } from "@/lib/commands/catalog";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { plural } from "./plural";
import { suggestPriceGroup, type PriceGroupSuggestion, type SuggestionGroups } from "./price-group-suggestion";
import { expires, type RegistryRowView } from "./registry-rows";

export type BrandViewModel = {
  backHref?: string;
  name: string;
  style: string;
  styleOptions: string[];
  abv: string;
  category: string;
  categoryOptions: string[];
  /** The group's id, or UNPRICED. Ids, not names: a group may be named anything, even "Unpriced". */
  priceGroup: string;
  priceGroupOptions: { value: string; label: string }[];
  /** What the brand's recipe cost says about the group; null when it has no recipe. */
  suggestion: PriceGroupSuggestion | null;
  description: string;
  hops: string;
  skuList: string;
  skuListHref: string;
  /** The brand's own compliance: its COLA/formula approvals and state registrations; a pending row when no COLA is on file. */
  compliance: RegistryRowView[];
};

const CATEGORIES = ["Core", "Seasonal", "One-off", "Barrel-aged"];
/** The select value for "no price group": not a name, so no real group can collide with it. */
export const UNPRICED = "__unpriced";

export type BrandSnapshot = {
  brand: {
    id: string;
    name: string;
    abv: number | string | null;
    description: string | null;
    category: string | null;
    hops: string | null;
    price_group_id: string | null;
    styles: { name: string } | null;
    skus: { id: string; active: boolean }[];
  };
  /** Brewery styles list; may include an inventory "Add …" option. */
  styles: string[];
  categories?: string[];
  /** list_price_groups; position and ceiling feed the suggestion. */
  priceGroups: SuggestionGroups;
  /** get_brand_recipe_cost. Absent means no recipe. */
  cost?: Pick<BrandRecipeCost, "costCentsPerBbl" | "uncosted">;
  /** This brand's rows from get_compliance_registry. Absent means none on file. */
  compliance?: Pick<RegistryBrand, "approvals" | "registrations">;
  backHref?: string;
};

/** A COLA is filed under a serial and never expires; a formula keeps its TTB number; registrations do expire. */
export function brandComplianceRows({ approvals, registrations }: NonNullable<BrandSnapshot["compliance"]>): RegistryRowView[] {
  const rows: RegistryRowView[] = [
    ...approvals.map((approval) => ({
      key: approval.id,
      title: approval.kind === "cola" ? `COLA serial ${approval.ttb_id}` : `Formula ${approval.ttb_id}`,
      detail: approval.approved_on ? `submitted ${approval.approved_on}` : "not submitted",
      verb: "Edit",
    })),
    ...registrations.map((registration) => ({
      key: registration.id,
      title: `${registration.state} registration`,
      detail: `${registration.registration_no ?? "no number"}${expires(registration.expires_on)}`,
      verb: "Edit",
    })),
  ];
  if (!approvals.some((approval) => approval.kind === "cola")) rows.unshift({ key: "cola-pending", title: "COLA", detail: "pending", warning: true });
  return rows;
}

export function toBrandViewProps({
  brand,
  styles,
  categories = CATEGORIES,
  priceGroups,
  compliance = { approvals: [], registrations: [] },
  cost,
  backHref,
}: BrandSnapshot): BrandViewModel {
  // "Unpriced" is a real choice: a brand on no group cannot be ordered.
  const active = brand.skus.filter((s) => s.active).length;
  const style = brand.styles?.name ?? "";
  const styleOptions = style && !styles.includes(style) ? [style, ...styles] : styles;
  return {
    backHref,
    name: brand.name,
    style,
    styleOptions,
    // Echoed as typed: a live form's "12x" stays "12x" for the person to fix, never "NaN".
    abv: brand.abv == null ? "" : String(brand.abv),
    category: brand.category ?? "",
    categoryOptions: categories,
    priceGroup: brand.price_group_id ?? UNPRICED,
    priceGroupOptions: [{ value: UNPRICED, label: "Unpriced" }, ...priceGroups.map((g) => ({ value: g.id, label: g.name }))],
    suggestion: cost ? suggestPriceGroup({ ...cost, groups: priceGroups }) : null,
    description: brand.description ?? "",
    hops: brand.hops ?? "",
    skuList: plural(active, "active package"),
    skuListHref: "/catalog",
    compliance: brandComplianceRows(compliance),
  };
}
