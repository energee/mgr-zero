"use client";

// Customer detail → Portal users row verb: confirm, then end one buyer's
// portal access (revoke_customer_user). Copy only; the sheet is ConfirmDeleteControl.
import { ConfirmDeleteControl } from "./confirm-delete";

export function RevokePortalUserControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Remove access" size="sm" {...rest}
    name={<>Remove <strong>{name}</strong> from this customer’s portal?</>}
    warning="They can no longer see or place this customer’s orders. Orders and invoices stay, and their sign-in account remains." />;
}
