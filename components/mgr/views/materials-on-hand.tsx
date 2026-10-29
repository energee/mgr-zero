// components/mgr/views/materials-on-hand.tsx — Materials on hand, drawn by the
// shared RecordTable (#1516): name, type, on hand, lots and status, then Edit
// (the material's definition) beside Count (stock at one bin). No material
// page exists, so the name is plain text. The live page passes MaterialForm and
// CountForm as rowEdit and rowCount; without them (the screen inventory) the
// row draws plain Edit and Count buttons.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { MaterialsOnHandRowView, MaterialsOnHandViewModel } from "@/lib/mgr/materials-on-hand-view";

export type { MaterialsOnHandViewModel };

export function MaterialsOnHandView({
  model,
  header,
  controls,
  createAction,
  rowEdit,
  rowCount,
}: {
  model: MaterialsOnHandViewModel;
  header?: ReactNode;
  /** The search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
  createAction?: ReactNode;
  rowEdit?: (row: MaterialsOnHandRowView) => ReactNode;
  rowCount?: (row: MaterialsOnHandRowView) => ReactNode;
}) {
  return (
    <>
      {header ?? E.back("Beer", "Materials on hand", createAction !== undefined ? createAction : E.btn("Add material"), model.backHref)}
      {controls}
      {model.empty
        ? E.blank(model.empty, undefined, model.purchaseOrdersHref ? E.act("Purchase orders", "primary", model.purchaseOrdersHref) : undefined)
        : <RecordTable
          // The action column needs no visible header: its buttons name the verbs.
          headers={["Material", "Type", "On hand", "Lots", "Status", <span key="actions" className="sr-only">Actions</span>]}
          align={["l", "l", "r", "l", "l", "l"]}
          rows={model.rows.map((row) => ({
            key: row.key,
            href: null,
            cells: [
              row.name, row.type, row.onHand, row.lots, row.status,
              <span key="actions" className="flex gap-2">
                {rowEdit ? rowEdit(row) : E.act("Edit")}
                {rowCount ? rowCount(row) : E.act("Count", "info")}
              </span>,
            ],
            sort: [row.name, row.type, row.onHandQty, row.lots, row.status, null],
          }))}
        />}
    </>
  );
}
