// components/mgr/views/price-group.tsx — one price-group row. Inventory
// draws name / position / ceiling edits (name required; Position and the
// optional Cost ceiling explain themselves under the field) and the group's
// UPC per packaged format; live keeps GroupForm as the wrapper and slots a
// barcode editor in.
// Each pour row carries Edit pour (rename, resize) beside Remove.
// Removing a pour and deleting the group confirm first; both surfaces draw the
// same two controls below, live binding onDelete to the commands.
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { priceGroupFieldErrors, type PriceGroupViewModel } from "@/lib/mgr/price-group-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { PriceGroupViewModel };

type ConfirmProps = { busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> };

/** Confirm, then delete one pour (delete_format) from its price group. */
export function RemovePourControl({ pour, group, ...rest }: ConfirmProps & { pour: string; group: string }) {
  return <ConfirmDeleteControl title={`Remove ${pour}`} triggerLabel="Remove" size="sm" busyLabel="Removing…" {...rest}
    name={<>Remove the <strong>{pour}</strong> pour from {group}?</>}
    warning="Refused while its price cells are filled, or while a Square mapping, menu line or recorded sale uses it." />;
}

/** Confirm, then delete the price group (delete_price_group). */
export function DeletePriceGroupControl({ group, ...rest }: ConfirmProps & { group: string }) {
  return <ConfirmDeleteControl title={`Delete ${group}`} triggerLabel="Delete" {...rest}
    name={<>Delete the <strong>{group}</strong> price group? This cannot be undone.</>}
    warning="A group a brand sits on, a pour belongs to, or a cell is filled for cannot be deleted." />;
}

type Controls = Partial<Record<"name" | "position" | "costCeiling", (value: string) => void>>;

export function PriceGroupView({ model, controls = {}, validationAttempted = false, back, messages, footer, addPour, renderPour, renderBarcode }: {
  model: PriceGroupViewModel; controls?: Controls; validationAttempted?: boolean; back?: ReactNode; messages?: ReactNode; footer?: ReactNode; addPour?: ReactNode;
  renderPour?: (pour: { id: string; name: string; ounces: string }) => ReactNode;
  /** Live: the row's edit control for one format's UPC. Inventory draws the code, or "none". */
  renderBarcode?: (barcode: { formatId: string; format: string; upc: string }) => ReactNode;
}) {
  const touched = useTouchedLines(validationAttempted);
  const errors = priceGroupFieldErrors(model);
  return (
    <>
      {back !== undefined ? back : E.back("Price groups", model.name, undefined, model.backHref)}
      {E.edit("Group name", model.name, "text", undefined, { id: "price-group-name", onChange: controls.name, required: true })}
      {/* list_price_groups orders by position (gaps kept), and suggestPriceGroup reads ceilings in that order. */}
      <div className="flex min-w-0 flex-col gap-2">
        {E.edit("Position", model.position, "number", undefined, { id: "price-group-position", onChange: controls.position, onBlur: () => touched.touch(0), error: (!controls.position || touched.shown(0)) ? errors.position : undefined, min: 1, step: 1, required: true, "aria-describedby": "price-group-position-help" })}
        <FieldDescription id="price-group-position-help">This group’s row in the price grid: lower numbers sit higher.</FieldDescription>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {E.edit("Cost ceiling ($/bbl) · optional", model.costCeilingInput, "number", undefined, { id: "price-group-ceiling", onChange: controls.costCeiling, onBlur: () => touched.touch(1), error: (!controls.costCeiling || touched.shown(1)) ? errors.costCeiling : undefined, min: 0, max: 21474836.47, step: "any", "aria-describedby": "price-group-ceiling-help" })}
        <FieldDescription id="price-group-ceiling-help">Dollars per barrel of recipe cost. A brand’s page suggests the first group, from the top row down, whose ceiling is at or above the brand’s recipe cost.</FieldDescription>
      </div>
      {model.previousCeilingLabel && model.previousCeiling
        ? E.fld(model.previousCeilingLabel, model.previousCeiling)
        : null}
      {model.prices !== undefined ? E.fld("Prices", model.prices) : null}
      {model.pours && (
        <>
          {E.ttl("Pours")}
          {model.pours.length === 0
            ? E.info("Add a pour size this group sells by the glass. Every beer on the group uses it.")
            : model.pours.map((pour) => (
              <Fragment key={pour.id}>
                {E.row(pour.name, `${pour.ounces} oz`, renderPour ? renderPour(pour) : <div className="flex gap-2">{E.btn("Edit pour", "g")}<RemovePourControl pour={pour.name} group={model.name} /></div>)}
              </Fragment>
            ))}
          {addPour}
        </>
      )}
      {model.barcodes && (
        <>
          {E.ttl("Barcodes")}
          {E.info("Every SKU on this group scans as the group's code for its format, unless the SKU has its own. A format with no code is fine: kegs usually have none.")}
          {model.barcodes.map((b) => (
            <Fragment key={b.formatId}>
              {renderBarcode ? renderBarcode(b) : E.fld(`UPC · ${b.format}`, b.upc || "none")}
            </Fragment>
          ))}
        </>
      )}
      {messages}
      {footer !== undefined ? footer : E.row("Remove price group", model.removeDetail ?? "", <DeletePriceGroupControl group={model.name} />, "w")}
    </>
  );
}
