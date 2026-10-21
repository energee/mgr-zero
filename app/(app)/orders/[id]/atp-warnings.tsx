// app/(app)/orders/[id]/atp-warnings.tsx — the soft ATP warnings that
// confirm_order, adjust_order_lines and set_standing_allocation return
// ({ sku_id, atp } per SKU left negative). Drawn by the Confirm order review
// (confirm/confirm-buttons.tsx, the only place an order is confirmed, #713),
// Adjust lines (adjust-lines-form.tsx) and the standing allocation sheet
// (replenishment/quantity-form.tsx) (#1088).
"use client";

import { CommandFormMessage } from "@/components/mgr/command-form";

export type AtpWarning = { sku_id: string; atp: number };

/** Reads the `warnings` array out of a confirm_order, adjust_order_lines or set_standing_allocation result. */
export function atpWarnings(data: unknown): AtpWarning[] {
  return (data as { warnings?: AtpWarning[] } | null)?.warnings ?? [];
}

/** `saved` leads the warnings when the write they follow has already been saved (#1088). */
export function AtpWarnings({ warnings, skuNames, saved }: { warnings: AtpWarning[]; skuNames: Map<string, string>; saved?: string }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {saved && <p role="status" className="text-sm">{saved}</p>}
      {warnings.map((w) => (
        <CommandFormMessage key={w.sku_id} tone="warning">
          ATP negative for {skuNames.get(w.sku_id) ?? w.sku_id}
        </CommandFormMessage>
      ))}
    </div>
  );
}
