// components/mgr/views/location-bins.tsx — the Bins section of Location
// detail (#1507). Both paths draw the adapter's rows under a Bins heading;
// live passes BinForm as createAction and as each row's action, and the Move
// stock form (drawing MoveStockFields) as footer; inventory uses Add bin and
// nav rows. Nothing stored draws the empty state.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LocationBinsViewModel, MoveStockOptions, MoveStockValue } from "@/lib/mgr/location-bins-view";

/** Move stock between two bins: stock and its source bin, a different
 *  destination, and a quantity no larger than the source bin holds. */
export function MoveStockFields({ value, options, onChange }: {
  value: MoveStockValue; options: MoveStockOptions; onChange?: (next: MoveStockValue) => void;
}) {
  return (
    <>
      {E.pick("Stock and source bin", value.source, options.stock, { id: "bin-stock", placeholder: "Choose stock", onChange: onChange ? (source) => onChange({ source, toBinId: "", qty: "", note: value.note }) : undefined })}
      {E.pick("Destination bin", value.toBinId, options.destinations, { id: "bin-destination", placeholder: "Choose a different bin", disabled: !value.source, onChange: onChange ? (toBinId) => onChange({ ...value, toBinId }) : undefined })}
      {E.edit(`Quantity${options.unit ? ` (${options.unit})` : ""}`, value.qty, "number", undefined, { id: "bin-qty", min: options.wholeUnits ? 1 : 0.0001, step: options.wholeUnits ? 1 : 0.0001, max: options.max, required: true, onChange: onChange ? (qty) => onChange({ ...value, qty }) : undefined })}
      {E.edit("Note", value.note, "text", undefined, { id: "bin-note", onChange: onChange ? (note) => onChange({ ...value, note }) : undefined })}
    </>
  );
}

export function LocationBinsView({
  model,
  createAction,
  footer,
  rowActions,
}: {
  model: LocationBinsViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: each bin's action (BinForm's Edit) by row key; the inventory taps the row instead. */
  rowActions?: Record<string, ReactNode>;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">{E.group("Bins")}{createAction}</div>
      <div className="[&_[data-slot=item-content]]:min-w-0 [&_[data-slot=item-title]]:line-clamp-none [&_[data-slot=item-title]]:max-w-full">
        {model.rows.map((row) => {
          const title = <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{row.title}</span>;
          return <Fragment key={row.key}>{rowActions ? E.row(title, row.detail, rowActions[row.key]) : E.nav(title, row.detail)}</Fragment>;
        })}
      </div>
      {belowRows(model, footer, createAction)}
    </>
  );
}

/** Under the rows: the empty state, why Move stock is unavailable, the live
 *  footer (Move stock), or the inventory's Add bin when no createAction came. */
function belowRows(model: LocationBinsViewModel, footer: ReactNode, createAction: ReactNode): ReactNode {
  if (model.empty) return E.blank(model.empty, undefined, E.btn("Record movement", "g", model.inventoryHref));
  if (model.moveUnavailable) return E.gated("Move stock", model.moveUnavailable);
  if (footer !== undefined) return footer;
  return createAction !== undefined ? null : E.btn("Add bin", "g");
}
