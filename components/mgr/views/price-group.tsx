// components/mgr/views/price-group.tsx — one price-group row. Inventory
// draws name / position / ceiling edits; live keeps GroupForm as the wrapper.
// Removing a pour and deleting the group confirm first; both surfaces draw the
// same two controls below, live binding onDelete to the commands.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PriceGroupViewModel } from "@/lib/mgr/price-group-view";
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

export function PriceGroupView({ model, controls = {}, back, messages, footer, addPour, renderPour }: {
  model: PriceGroupViewModel; controls?: Controls; back?: ReactNode; messages?: ReactNode; footer?: ReactNode; addPour?: ReactNode;
  renderPour?: (pour: { id: string; name: string; ounces: string }) => ReactNode;
}) {
  return (
    <>
      {back !== undefined ? back : E.back("Price groups", model.name, undefined, model.backHref)}
      {E.edit("Group name", model.name, "text", undefined, controls.name && { onChange: controls.name })}
      {E.edit("Position", model.position, "number", undefined, { onChange: controls.position, min: 1, step: 1, required: true })}
      {E.edit("Cost ceiling ($/bbl)", controls.costCeiling ? model.costCeilingInput : model.costCeiling, "number", undefined, { onChange: controls.costCeiling, min: 0 })}
      {E.info("Dollars per barrel of recipe cost: a brand whose cost lands between the previous group’s ceiling and this one gets this group suggested on Brand, never moved.")}
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
                {E.row(pour.name, `${pour.ounces} oz`, renderPour ? renderPour(pour) : <RemovePourControl pour={pour.name} group={model.name} />)}
              </Fragment>
            ))}
          {addPour}
        </>
      )}
      {messages}
      {footer !== undefined ? footer : E.row("Remove price group", model.removeDetail ?? "", <DeletePriceGroupControl group={model.name} />, "w")}
    </>
  );
}
