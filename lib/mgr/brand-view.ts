// lib/mgr/brand-view.ts — view-model for Brand detail. list_brands (one row)
// plus list_price_groups, the brewery's styles, and the brand's rows from
// get_compliance_registry paint BrandView.
import type { Approval, Registration } from "@/lib/commands/compliance";
import { plural } from "./plural";

export type BrandComplianceRow = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
  warning?: boolean;
};

export type BrandViewModel = {
  backHref?: string;
  name: string;
  style: string;
  styleOptions: string[];
  abv: string;
  category: string;
  categoryOptions: string[];
  priceGroup: string;
  priceGroupOptions: string[];
  description: string;
  hops: string;
  skuList: string;
  skuListHref: string;
  /** The brand's own compliance: its COLA/formula approvals and state registrations, or one pending row. */
  compliance: BrandComplianceRow[];
  colaPending: boolean;
};

const CATEGORIES = ["Core", "Seasonal", "One-off", "Barrel-aged"];
export const UNPRICED = "Unpriced";

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
  /** list_price_groups. */
  priceGroups: { id: string; name: string }[];
  /** This brand's rows from get_compliance_registry. Absent means none on file. */
  compliance?: { approvals: Approval[]; registrations: Registration[] };
  backHref?: string;
};

const expires = (date: string | null) => date ? ` · expires ${date}` : "";

/** A COLA is filed under a serial and never expires; a formula keeps its TTB number; registrations do expire. */
export function brandComplianceRows({ approvals, registrations }: NonNullable<BrandSnapshot["compliance"]>): BrandComplianceRow[] {
  const rows: BrandComplianceRow[] = [
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
  backHref,
}: BrandSnapshot): BrandViewModel {
  const group = priceGroups.find((g) => g.id === brand.price_group_id);
  // "Unpriced" is a real choice: a brand on no group cannot be ordered.
  const active = brand.skus.filter((s) => s.active).length;
  const style = brand.styles?.name ?? "";
  const styleOptions = style && !styles.includes(style) ? [style, ...styles] : styles;
  return {
    backHref,
    name: brand.name,
    style,
    styleOptions,
    abv: brand.abv == null || brand.abv === "" ? "" : String(Number(brand.abv)),
    category: brand.category ?? "",
    categoryOptions: categories,
    priceGroup: group?.name ?? UNPRICED,
    priceGroupOptions: [UNPRICED, ...priceGroups.map((g) => g.name)],
    description: brand.description ?? "",
    hops: brand.hops ?? "",
    skuList: plural(active, "active package"),
    skuListHref: "/catalog",
    compliance: brandComplianceRows(compliance),
    colaPending: !compliance.approvals.some((approval) => approval.kind === "cola"),
  };
}
