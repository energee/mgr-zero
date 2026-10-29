// lib/mgr/materials-on-hand-view.ts — view-model for Materials on hand, and
// its Type pick (?category= narrows list_materials). Each material from
// list_materials, with on hand summed across bins, becomes one RecordTable
// row: name, type, on hand in its base unit, lots and status.
import type { ListScope } from "@/components/mgr/list-controls";
import type { EmptyState } from "./empty-state";
import { MATERIAL_CATEGORIES } from "./enums";
import { sentenceCase } from "./labels";

/** One material as the page reads it: its definition and its summed on hand. */
export type MaterialsOnHandMaterial = {
  key: string;
  name: string;
  category: string;
  /** The base unit on hand is counted in. */
  unit: string;
  onHand: number;
  lotTracked: boolean;
  active: boolean;
};

export type MaterialsOnHandRowView = {
  key: string;
  name: string;
  type: string;
  /** "1,262.5 lb": thousands separated, at most two decimals, then the unit. */
  onHand: string;
  /** The on-hand figure the column sorts by. */
  onHandQty: number;
  /** "Tracked" for a lot-tracked material, else null (an empty cell). */
  lots: string | null;
  status: "Active" | "Inactive";
};

export type MaterialsOnHandViewModel = {
  backHref?: string;
  purchaseOrdersHref?: string | null;
  rows: MaterialsOnHandRowView[];
  empty?: EmptyState;
};

export type MaterialsOnHandSnapshot = {
  backHref?: string;
  /** Undefined keeps inventory navigation inert; null means the caller cannot open Purchase orders. */
  purchaseOrdersHref?: string | null;
  rows?: MaterialsOnHandMaterial[];
  /** A search or type is on, so an empty list means no match, not no materials. */
  filtered?: boolean;
};

function toRow(m: MaterialsOnHandMaterial): MaterialsOnHandRowView {
  return {
    key: m.key,
    name: m.name,
    type: sentenceCase(m.category),
    onHand: `${m.onHand.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.unit}`,
    onHandQty: m.onHand,
    lots: m.lotTracked ? "Tracked" : null,
    status: m.active ? "Active" : "Inactive",
  };
}

export function toMaterialsOnHandViewProps(s: MaterialsOnHandSnapshot): MaterialsOnHandViewModel {
  const rows = (s.rows ?? []).map(toRow);
  const description = s.purchaseOrdersHref === null
    ? "Add a material, then ask an Admin or Warehouse teammate to order and receive it."
    : "Add a material, then receive a purchase order to put it on hand.";
  const empty = rows.length > 0 ? undefined
    : s.filtered ? { title: "No materials match", description: "Clear the search or choose All types to see every material." }
    : { title: "No materials yet", description };
  const purchaseOrdersHref = s.purchaseOrdersHref === undefined ? "#" : s.purchaseOrdersHref;
  return { backHref: s.backHref, purchaseOrdersHref: s.filtered || rows.length ? undefined : purchaseOrdersHref, rows, empty };
}

/** The Type pick over the list: All types, then each material kind. Live,
 *  `href` links each option; the inventory leaves it out and the pick stays inert. */
export function toMaterialsScopes({ category, href }: { category: string; href?: (patch: { category: "" | (typeof MATERIAL_CATEGORIES)[number] }) => string }): ListScope[] {
  return [{
    label: "Type",
    value: category,
    options: (["", ...MATERIAL_CATEGORIES] as const).map((value) => ({ value, label: value ? sentenceCase(value) : "All types", href: href?.({ category: value }) })),
  }];
}
