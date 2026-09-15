"use client";

import { ConfirmDeleteControl } from "./confirm-delete";

export function DeleteCustomerControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete customer" size="sm" {...rest}
    name={<>Delete <strong>{name}</strong> and its ship-to addresses? This cannot be undone.</>}
    warning="Customers with orders, invoices, keg records, portal access, invitations or a QuickBooks link cannot be deleted." />;
}
