// app/(app)/pricing/clear-override-button.tsx — clear_price_list_item: drop a
// SKU's override so the format default applies again.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { command } from "@/lib/commands/client";
import { useBrewery } from "@/app/(app)/brewery-provider";

export function ClearOverrideButton({ priceListId, skuId }: { priceListId: string; skuId: string }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await command(breweryId, "clear_price_list_item", { priceListId, skuId }); router.refresh(); } finally { setBusy(false); }
    }}>Clear</Button>
  );
}
