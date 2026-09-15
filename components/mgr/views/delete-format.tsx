"use client";

import { ConfirmDeleteControl } from "./confirm-delete";

export function DeleteFormatControl({ name, ...rest }: { name: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete format" {...rest}
    name={<>Delete <strong>{name}</strong> and its contents and packaging-material assignments? This cannot be undone.</>}
    warning="The smaller formats and materials themselves stay. Formats used by a SKU, another package, pricing or history cannot be deleted." />;
}
