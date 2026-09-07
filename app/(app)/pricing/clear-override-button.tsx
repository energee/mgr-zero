// app/(app)/pricing/clear-override-button.tsx — clear_price_list_item: drop a
// SKU's override so the format default applies again.
"use client";

import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function ClearOverrideButton({ priceListId, skuId }: { priceListId: string; skuId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => run("clear_price_list_item", { priceListId, skuId })}>Clear</Button>
      <CommandFormMessage error={error} />
    </>
  );
}
