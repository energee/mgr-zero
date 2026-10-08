// components/mgr/views/location-bins.tsx — Location bins list. Live passes
// BinForm as createAction, a bins slot, and the Move stock form (drawing
// MoveStockFields) as footer; inventory uses Add bin and nav.
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

export type { LocationBinsViewModel };

export function LocationBinsView({
  model,
  createAction,
  footer,
  bins,
}: {
  model: LocationBinsViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
  /** Live: one row per bin with BinForm in action. */
  bins?: { key: string; title: string; detail: string; action?: ReactNode }[];
}) {
  return (
    <>
      {E.back(model.backLabel, "Bins", createAction, model.backHref)}
      {bins
        ? bins.map((row) => (
          <Fragment key={row.key}>{E.row(row.title, row.detail, row.action)}</Fragment>
        ))
        : model.rows.map((row) => (
          <Fragment key={row.key}>{E.nav(row.title, row.detail)}</Fragment>
        ))}
      {model.moveUnavailable ? E.gated("Move stock", model.moveUnavailable) : footer !== undefined ? footer : (createAction !== undefined ? null : E.btn("Add bin", "g"))}
    </>
  );
}
