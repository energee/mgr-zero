// app/(app)/orders/[id]/restock/put-back-button.tsx — the one write on the
// Put back page: confirm_restock, then back to Today.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { command } from "@/lib/commands/client";
import { useBrewery } from "../../../brewery-provider";

export function PutBackButton({ orderId, label }: { orderId: string; label: string }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function putBack() {
    setBusy(true); setError(null);
    try {
      await command(breweryId, "confirm_restock", { orderId });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "confirm_restock failed");
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button className="w-full md:w-fit" disabled={busy} onClick={putBack}>{busy ? "Putting back…" : label}</Button>
      <CommandFormMessage error={error} />
    </div>
  );
}
