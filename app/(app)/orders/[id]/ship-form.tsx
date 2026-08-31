// app/(app)/orders/[id]/ship-form.tsx — dialog form for the ship_order
// command. The plpgsql fn requires the ship array to cover every order line,
// so unpicked/held-back lines are sent with qty 0; qty defaults to each
// line's qty_picked. On success shows a link to the created invoice when the
// order shipped anything on a wholesale order (taproom transfers get none).
// Calls the command endpoint directly (not useCommandForm) so it can read
// the invoice_id back out of the response.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrewery } from "../../brewery-provider";
import { command } from "@/lib/commands/client";

export type ShipLine = { id: string; skuName: string; qtyPicked: number | null };

function initialQtys(lines: ShipLine[]) {
  return Object.fromEntries(lines.map((l) => [l.id, String(l.qtyPicked ?? 0)]));
}

export function ShipForm({ orderId, lines }: { orderId: string; lines: ShipLine[] }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(lines));
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipped, setShipped] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  function reset() {
    setQtys(initialQtys(lines));
    setCarrier("");
    setTracking("");
    setError(null);
    setShipped(false);
    setInvoiceId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = (await command(breweryId, "ship_order", {
        orderId,
        carrier: carrier || undefined,
        tracking: tracking || undefined,
        ship: lines.map((l) => ({ lineId: l.id, qty: Number(qtys[l.id] ?? 0) })),
      })) as { invoice_id: string | null };
      setInvoiceId(data.invoice_id ?? null);
      setShipped(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ship_order failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Ship</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ship order</DialogTitle>
        </DialogHeader>
        {shipped ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">Order shipped.</p>
            {invoiceId ? (
              <Link href={`/invoices/${invoiceId}`} className="text-sm underline underline-offset-2">
                View invoice
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">No invoice was created.</p>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Label className="flex-1 font-normal">
                    {l.skuName} (picked {l.qtyPicked ?? 0})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="w-24"
                    value={qtys[l.id] ?? ""}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="ship-carrier">Carrier</Label>
                <Input id="ship-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="ship-tracking">Tracking</Label>
                <Input id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Shipping…" : "Ship"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
