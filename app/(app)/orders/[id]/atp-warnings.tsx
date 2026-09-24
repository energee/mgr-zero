// app/(app)/orders/[id]/atp-warnings.tsx — the soft ATP warnings
// confirm_order returns ({ sku_id, atp } per line left negative), drawn once
// for both callers: the order detail's lifecycle-buttons.tsx and the Confirm
// order review's confirm/confirm-buttons.tsx.
"use client";

import { CommandFormMessage } from "@/components/mgr/command-form";

export type AtpWarning = { sku_id: string; atp: number };

/** Reads the `warnings` array out of a confirm_order (or other lifecycle) result. */
export function atpWarnings(data: unknown): AtpWarning[] {
  return (data as { warnings?: AtpWarning[] } | null)?.warnings ?? [];
}

export function AtpWarnings({ warnings, skuNames }: { warnings: AtpWarning[]; skuNames: Map<string, string> }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {warnings.map((w) => (
        <CommandFormMessage key={w.sku_id} tone="warning">
          ATP negative for {skuNames.get(w.sku_id) ?? w.sku_id}
        </CommandFormMessage>
      ))}
    </div>
  );
}
