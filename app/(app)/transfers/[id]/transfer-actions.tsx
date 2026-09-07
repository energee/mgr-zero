// app/(app)/transfers/[id]/transfer-actions.tsx — the one next verb for a
// stock transfer by status: Submit (draft), Record pick (submitted; picks
// default to the ordered qty), Receive (picked; quantities default to picked).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { command } from "@/lib/commands/client";
import { useBrewery } from "@/app/(app)/brewery-provider";

type Line = { id: string; qty: number; qtyPicked: number | null };

export function TransferActions({ transferId, status, lines }: { transferId: string; status: string; lines: Line[] }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(name: string, input: unknown) {
    setBusy(true); setError(null);
    try { await command(breweryId, name, input); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : `${name} failed`); }
    finally { setBusy(false); }
  }
  const irreversible = "w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit";
  return (
    <div className="flex flex-col gap-2">
      {status === "draft" && <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("submit_stock_transfer", { transferId })}>Submit</Button>}
      {status === "submitted" && <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("record_stock_transfer_pick", { transferId, picks: lines.map((l) => ({ lineId: l.id, qty: l.qty })) })}>Record pick</Button>}
      {(status === "picked" || status === "in_transit") && (
        <Button data-variant="irreversible" className={irreversible} disabled={busy} onClick={() => run("receive_stock_transfer", { transferId, lines: lines.map((l) => ({ lineId: l.id, qty: l.qtyPicked ?? l.qty })) })}>Receive</Button>
      )}
      <CommandFormMessage error={error} />
    </div>
  );
}
