import { formatDate } from "@/lib/date-format";
import type { StaffRole } from "@/lib/commands/registry";
import type { EmptyState } from "./empty-state";
import { canOpen } from "./nav";

export type MaterialRequirementSnapshot = {
  material_id: string;
  material_name: string | null;
  base_uom: string | null;
  purchase_uom: string | null;
  required: number;
  projected: number;
  on_hand: number;
  on_order: number;
  short: number;
  purchase_units_short: number;
  needed_by: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  lead_time_days: number | null;
  buy_by: string | null;
  out_of_reach: boolean;
};

export type PlanningSnapshot = {
  requirements?: MaterialRequirementSnapshot[];
  horizon?: (string | number)[][];
  reviews?: { key: string; title: string; detail: string; warning?: boolean }[];
  drafts?: { key: string; title: string; detail: string; quantity: string; warning?: boolean }[];
  info?: string;
  /** The brewery's day (YYYY-MM-DD); a gap needed before it is overdue (#993). */
  today?: string;
  /** Where the back link goes; the live page passes "/more", the inventory leaves it "#". */
  backHref?: string;
  /** The viewer's roles, live only: the empty state links only pages they can
   *  open. The inventory omits them and draws every link row, inert. */
  roles?: readonly StaffRole[];
};

/** The empty list's words, plus the pages where the demand it counts is set up
 *  (`href` only on the live page). */
type PlanningEmpty = EmptyState & { links: { title: string; detail: string; href?: string }[] };

/** One shortage row. setVendorHref matters only on a row with no vendor: the
 *  Materials page searched to that material (live, a role that can open it),
 *  null (live, a role that cannot: no Set vendor), or undefined (the
 *  inventory: an inert tap). */
export type PlanningRowView = { key: string; title: string; detail: string; quantity: string; warning: boolean; setVendorHref?: string | null };

/** The rows that resolve to one vendor (vendor null: no contract and no
 *  default vendor). draftIds are the materials its purchase order would
 *  cover: the rows still in reach of their buy-by date. */
export type PlanningGroupView = { key: string; vendor: string | null; rows: PlanningRowView[]; draftIds: string[] };

export type PlanningViewModel = {
  /** By vendor name, A to Z, then the rows with no vendor (#1516). */
  groups: PlanningGroupView[];
  horizon?: (string | number)[][];
  reviews?: PlanningSnapshot["reviews"];
  drafts?: PlanningSnapshot["drafts"];
  info?: string;
  backHref?: string;
  empty?: PlanningEmpty;
};

/** The live page asks only for short materials, so an empty list says nothing
 *  about whether any batch or run is planned (#1142). */
const NOTHING_SHORT: EmptyState = {
  title: "No material shortages",
  description: "Planning lists only materials that planned or brewing batches, open packaging runs, or uncovered orders need beyond on hand and sent purchase orders. An empty list does not mean any work is scheduled.",
};

/** Where the demand Planning counts is set up, under their nav labels; the
 *  empty state links to them. */
const SETUP_LINKS = [
  { title: "Batches", detail: "Plan a batch so its recipe's ingredients are counted.", href: "/batches" },
  { title: "Packaging", detail: "Schedule a run so its formats' materials are counted.", href: "/packaging" },
  { title: "Materials", detail: "Give each material a default vendor so its shortage can be drafted into a purchase order.", href: "/materials" },
];

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

const leadText = (row: MaterialRequirementSnapshot) =>
  row.lead_time_days === null ? "no lead time typed" : `${row.lead_time_days} day lead${row.buy_by ? ` · buy by ${formatDate(row.buy_by)}` : ""}`;

export function toPlanningViewProps(snapshot: PlanningSnapshot): PlanningViewModel {
  const { roles } = snapshot;
  const shortages = (snapshot.requirements ?? []).filter((row) => row.short > 0);
  const byVendor = Map.groupBy(shortages, (row) => row.vendor_id);
  const groups = [...byVendor].map(([vendorId, rows]) => ({
    key: vendorId ?? "no-vendor",
    vendor: vendorId ? (rows[0].vendor_name ?? vendorId) : null,
    draftIds: vendorId ? rows.filter((row) => !row.out_of_reach).map((row) => row.material_id) : [],
    rows: rows.map((row): PlanningRowView => {
      const overdue = Boolean(snapshot.today && row.needed_by && row.needed_by < snapshot.today);
      const title = row.material_name ?? row.material_id;
      return {
        key: row.material_id,
        title,
        detail: [
          overdue ? "overdue" : undefined,
          `need ${fmt(row.required)} · on hand ${fmt(row.on_hand)} · on order ${fmt(row.on_order)} ${row.base_uom ?? ""}`,
          row.projected > 0 ? `includes ${fmt(row.projected)} projected` : undefined,
          row.needed_by ? `needed by ${formatDate(row.needed_by)}` : undefined,
          // The group heading names the vendor; a row keeps only its timing.
          vendorId ? leadText(row) : undefined,
          row.out_of_reach ? "past the buy-by date · left out of the draft" : undefined,
        ].filter(Boolean).join(" · "),
        quantity: `${fmt(row.purchase_units_short)} ${row.purchase_uom ?? ""}`.trim(),
        warning: !vendorId || row.out_of_reach || overdue,
        // A material's default vendor is set in its Edit sheet on Materials.
        setVendorHref: vendorId || !roles ? undefined : canOpen(roles, "/materials") ? `/materials?q=${encodeURIComponent(title)}` : null,
      };
    }),
  }));
  // A to Z by vendor; the rows no vendor can draft come last.
  groups.sort((a, b) => (a.vendor === null ? 1 : b.vendor === null ? -1 : a.vendor.localeCompare(b.vendor)));
  // Live, drop the links a role's nav hides (Batches is Brewer's). No roles is
  // the inventory: every row, without hrefs, as fixtures draw links.
  const links = roles
    ? SETUP_LINKS.filter((link) => canOpen(roles, link.href))
    : SETUP_LINKS.map((link) => ({ title: link.title, detail: link.detail }));
  return {
    groups,
    horizon: snapshot.horizon,
    reviews: snapshot.reviews,
    drafts: snapshot.drafts,
    info: snapshot.info,
    backHref: snapshot.backHref,
    empty: groups.length === 0 && !snapshot.horizon ? { ...NOTHING_SHORT, links } : undefined,
  };
}
