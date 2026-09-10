import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { InventoryDetailViewModel, InventoryMovement } from "@/lib/mgr/inventory-detail-view";
import { formatDateTime } from "@/lib/date-format";

export function InventoryDetailView({ model, movementAction, footer }: {
  model: InventoryDetailViewModel; movementAction?: (movement: InventoryMovement) => ReactNode; footer?: ReactNode;
}) {
  return <>
    {E.back("Finished goods", model.sku.name, undefined, model.backHref)}
    {!model.sku.active && E.fld("Status", "Inactive · history retained")}
    {E.num(String(model.available), `ATP · ${model.onHandTotal} on hand · ${model.allocated} allocated`)}
    {E.ttl("On hand by location")}
    {model.onHand.length ? model.onHand.map(row => <div key={row.location_id}>{E.row(row.locations?.name ?? row.location_id, "", String(row.qty))}</div>) : E.blank("No inventory recorded yet")}
    {E.ttl("Movement history")}
    {model.movements.length ? model.movements.map(m => <div key={m.id} id={`movement-${m.id}`}>
      {E.row(`${Number(m.qty) > 0 ? "+" : ""}${m.qty} · ${m.type.replaceAll("_", " ")}`, "", movementAction?.(m), "", undefined, <>
        <p className="text-sm">{m.locations?.name ?? m.location_id} · {m.bins?.name ?? m.bin_id} · {m.lot_id ? m.lots?.code ?? m.lot_id : "Untracked"} · {m.bbl} bbl · {m.package_type}{m.tax_treatment ? ` · ${m.tax_treatment}` : ""}{m.dest_state ? ` · ${m.dest_state}` : ""}</p>
        <p className="break-all text-xs text-muted-foreground">{formatDateTime(m.created_at)} · {m.id}{m.note ? ` · ${m.note}` : ""}{m.ref ? ` · source ${m.ref}` : ""}{m.source_movement_id ? ` · source movement ${m.source_movement_id}` : ""}</p>
      </>)}
    </div>) : E.blank("No movements recorded yet")}
    {footer}
  </>;
}
