// lib/mgr/materials-on-hand-view.ts — view-model for Materials on hand, and
// its Type pick (?category= narrows list_materials).
import type { ListScope } from "@/components/mgr/list-controls";
import type { EmptyState } from "./empty-state";
import { MATERIAL_CATEGORIES } from "./enums";
import { sentenceCase } from "./labels";
export type MaterialsOnHandRowView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
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
  rows?: MaterialsOnHandRowView[];
  /** A search or type is on, so an empty list means no match, not no materials. */
  filtered?: boolean;
};

export function toMaterialsOnHandViewProps(s: MaterialsOnHandSnapshot): MaterialsOnHandViewModel {
  const rows = s.rows ?? [];
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
