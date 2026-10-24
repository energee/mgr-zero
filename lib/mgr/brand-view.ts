// lib/mgr/brand-view.ts — view-model for Brand detail. list_brands (one row)
// plus list_price_groups, the brewery's styles, the brand's rows from
// get_compliance_registry and the Sells as reads (brand-sells-view.ts) paint
// BrandView.
import { NONE } from "@/components/ui/select";
import { formatDate } from "@/lib/date-format";
import type { BrandRecipeCost } from "@/lib/commands/catalog";
import type { RegistryBrand } from "@/lib/commands/compliance";
import { toBrandSellsModel, type BrandSellsModel, type BrandSellsSnapshot } from "./brand-sells-view";
import { COLA_NOT_ON_FILE, nameWithAlias } from "./labels";
import { plural } from "./plural";
import { suggestPriceGroup, type PriceGroupSuggestion } from "./price-group-suggestion";
import type { PriceGroupRow } from "./price-groups-view";
import { expires, type RegistryRowView } from "./registry-rows";

/** A brand as staff see it: its name, then its staff-only alias when it has one ("Appaloosa · Animal #14"). */
export const brandLabel = nameWithAlias;

/** A header badge: "w" is a warning; href makes it a jump link to its section. */
export type BrandBadge = { key: string; label: string; tone: "" | "w"; href?: string };

type BrandComplianceRow = RegistryRowView & { image?: { ttbId: string; url: string } };

export type BrandViewModel = {
  backHref?: string;
  /** The saved name and alias, so the title (like the badges) does not follow the typing; "New brand" before the first save. */
  title: string;
  /** Unsaved: no SKUs or compliance can hang off it yet. */
  isNew: boolean;
  /** Missing COLA, price group (or Unpriced), category, active SKU count; none on a new brand. */
  badges: BrandBadge[];
  name: string;
  /** Staff-only informal name; "" when none. */
  alias: string;
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
  /** One switch per packaged format, the packages inside the switched-on ones, and the group's pours. */
  sells: BrandSellsModel;
  /** The brand's own compliance: its COLA/formula approvals and state registrations; a pending row when no COLA is on file. */
  compliance: BrandComplianceRow[];
};

/** The select value for "no price group": the Select kit's own sentinel, never a name a real group could carry. */
export const UNPRICED: string = NONE;

export type BrandSnapshot = {
  brand: {
    id: string;
    name: string;
    alias?: string | null;
    abv: number | string | null;
    description: string | null;
    category: string | null;
    hops: string | null;
    price_group_id: string | null;
    styles: { name: string } | null;
    skus: BrandSellsSnapshot["brand"]["skus"];
    pours?: BrandSellsSnapshot["brand"]["pours"];
  };
  /** Brewery styles list; may include an inventory "Add …" option. */
  styles: string[];
  categories?: string[];
  /** list_price_groups; position and ceiling feed the suggestion. */
  priceGroups: PriceGroupRow[];
  /** get_brand_recipe_cost. Absent means no recipe. */
  cost?: Pick<BrandRecipeCost, "costCentsPerBbl" | "uncosted">;
  /** Sells as: packaged list_formats, list_channel_prices, list_sale_channels. Absent on a new brand, which sells nothing yet. */
  sells?: Omit<BrandSellsSnapshot, "brand">;
  /** This brand's rows from get_compliance_registry. Absent means none on file. */
  compliance?: Pick<RegistryBrand, "approvals" | "registrations">;
  backHref?: string;
  /** The brand as last saved, for the title and badges; defaults to `brand` (the inventory has no typing). */
  saved?: Pick<BrandSnapshot["brand"], "name" | "alias" | "category" | "price_group_id"> | null;
};

/** An approval's saved date, "approved Jan 15, 2026", or "approval date unknown" when none was entered. */
export function approvalDate(approvedOn: string | null): string {
  return approvedOn ? `approved ${formatDate(approvedOn)}` : "approval date unknown";
}

/** COLAs keep their identifiers and optional dated label image; only registrations expire. */
export function brandComplianceRows({ approvals, registrations }: NonNullable<BrandSnapshot["compliance"]>): BrandComplianceRow[] {
  const rows: BrandComplianceRow[] = [
    ...approvals.map((approval) => ({
      key: approval.id,
      title: approval.kind === "cola" ? `COLA TTB ID ${approval.ttb_id}` : `Formula ${approval.ttb_id}`,
      detail: [approvalDate(approval.approved_on), approval.serial_number && `serial ${approval.serial_number}`].filter(Boolean).join(" · "),
      verb: "Edit",
      ...(approval.kind === "cola" && approval.approved_on && approval.image_url
        ? { image: { ttbId: approval.ttb_id, url: approval.image_url } } : {}),
    })),
    ...registrations.map((registration) => ({
      key: registration.id,
      title: `${registration.state} registration`,
      detail: `${registration.registration_no ?? "no number"}${expires(registration.expires_on)}`,
      verb: "Edit",
    })),
  ];
  if (!approvals.some((approval) => approval.kind === "cola")) rows.unshift({ key: "cola-missing", title: "COLA", detail: COLA_NOT_ON_FILE });
  return rows;
}

export function toBrandViewProps({
  brand,
  styles,
  categories = [],
  priceGroups,
  compliance = { approvals: [], registrations: [] },
  cost,
  backHref,
  saved: savedOrNull,
  sells = { formats: [], prices: [], channels: [] },
}: BrandSnapshot): BrandViewModel {
  const saved = savedOrNull ?? brand;
  // "Unpriced" is a real choice: a brand on no group cannot be ordered.
  const active = brand.skus.filter((s) => s.active).length;
  const style = brand.styles?.name ?? "";
  const styleOptions = style && !styles.includes(style) ? [style, ...styles] : styles;
  const isNew = !brand.id;
  const skuList = `${plural(active, "active package")}${brand.pours?.length ? ` · ${plural(brand.pours.length, "pour")}` : ""}`;
  const group = priceGroups.find((g) => g.id === saved.price_group_id);
  const rows = brandComplianceRows(compliance);
  const cola: BrandBadge[] = rows.some((row) => row.key === "cola-missing") ? [{ key: "cola", label: `COLA · ${COLA_NOT_ON_FILE}`, tone: "", href: "#compliance" }] : [];
  const category: BrandBadge[] = saved.category ? [{ key: "category", label: saved.category, tone: "" }] : [];
  // A brand with nothing to sell yet needs no count; the SKUs section says so.
  const skus: BrandBadge[] = active || brand.pours?.length ? [{ key: "skus", label: skuList, tone: "" }] : [];
  const badges = isNew ? [] : [...cola, { key: "group", label: group?.name ?? "Unpriced", tone: group ? "" : "w" } satisfies BrandBadge, ...category, ...skus];
  return {
    backHref,
    title: isNew ? "New brand" : brandLabel(saved),
    isNew,
    badges,
    name: brand.name,
    alias: brand.alias ?? "",
    style,
    styleOptions,
    // Echoed as typed: a live form's "12x" stays "12x" for the person to fix, never "NaN".
    abv: brand.abv == null ? "" : String(brand.abv),
    category: brand.category ?? "",
    categoryOptions: categories,
    priceGroup: brand.price_group_id || UNPRICED,
    priceGroupOptions: [{ value: UNPRICED, label: "No price group" }, ...priceGroups.map((g) => ({ value: g.id, label: g.name }))],
    suggestion: cost ? suggestPriceGroup({ ...cost, groups: priceGroups }) : null,
    description: brand.description ?? "",
    hops: brand.hops ?? "",
    sells: toBrandSellsModel({ brand: { ...brand, price_group_id: saved.price_group_id, pours: brand.pours ?? [] }, ...sells }),
    compliance: rows,
  };
}
