import type { ReactNode } from "react";
import { sentenceCase } from "@/lib/mgr/labels";
import { E } from "@/components/mgr/e";
import type { InventoryDetailViewModel, InventoryMovement } from "@/lib/mgr/inventory-detail-view";
import { formatDateTime } from "@/lib/date-format";

/** `headerAction` is Record movement for this SKU: live links the movement
 *  deep link, or null for a user who may not record one; the inventory leaves
 *  it out and draws it inert. */
export function InventoryDetailView({ model, headerAction, movementAction, footer }: {
  model: InventoryDetailViewModel; headerAction?: ReactNode; movementAction?: (movement: InventoryMovement) => ReactNode; footer?: ReactNode;
}) {
  return <>
    {E.back("Finished goods", model.sku.name, headerAction !== undefined ? headerAction : E.btn("Record movement"), model.backHref)}
    {!model.sku.active && E.fld("Status", "Inactive · history retained")}
    {E.num(String(model.available), `Available · ${model.onHandTotal} on hand · ${model.allocated} allocated`)}
    {E.ttl("On hand by location")}
    {model.onHand.length ? model.onHand.map(row => <div key={row.location_id}>{E.row(row.locations?.name ?? row.location_id, "", String(row.qty))}</div>) : E.blank("No inventory recorded yet")}
    {E.ttl("Movement history")}
    {model.movements.length ? model.movements.map(m => <div key={m.id} id={`movement-${m.id}`}>
      {E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} · ${sentenceCase(m.type)}`, "", movementAction?.(m), "", undefined, <>
        <p className="text-sm">{m.locations?.name ?? "—"} · {m.bins?.name ?? "—"} · {m.lot_id ? m.lots?.code ?? "—" : "Untracked"} · {m.bbl} bbl · {m.package_type}{m.tax_treatment ? ` · ${sentenceCase(m.tax_treatment)}` : ""}{m.dest_state ? ` · ${m.dest_state}` : ""}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(m.created_at, model.timeZone)}{m.note ? ` · ${m.note}` : ""}{m.ref_label ? ` · ${m.ref_label}` : ""}</p>
      </>)}
    </div>) : E.blank("No movements recorded yet")}
    {footer}
  </>;
}
