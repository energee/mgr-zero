"use client";

// Customer detail → Ship-tos row verb: confirm, then delete one ship-to
// (delete_ship_to, #1487). Copy only; the sheet is ConfirmDeleteControl. The
// page offers it only on a non-default ship-to; an order's ship-to is refused.
import { ConfirmDeleteControl } from "./confirm-delete";

export function DeleteShipToControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete ship-to" triggerLabel="Delete" size="sm" {...rest}
    name={<>Delete the ship-to <strong>{name}</strong>? This cannot be undone.</>}
    warning="A ship-to that any order names cannot be deleted; the order keeps its destination." />;
}
