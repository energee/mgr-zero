// app/(portal)/portal/cart.tsx — client cart for the catalog page. Qty state
// keyed by skuId; "out" badge rows are disabled (qty forced to 0). Submit
// chains portal_create_order then portal_submit_order — the draft it creates
// along the way is an implementation detail, never shown to the customer.
// Save draft stops after portal_create_order so the customer can resume
// later from the orders list.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command } from "@/lib/commands/client";

export type CatalogItem = {
  skuId: string;
  name: string;
  product: string;
  unitPriceCents: number;
  badge: "in" | "low" | "out";
};
export type ShipToOption = { id: string; label: string };

const BADGE_STYLE: Record<CatalogItem["badge"], string> = {
  in: "bg-green-100 text-green-800",
  low: "bg-amber-100 text-amber-800",
  out: "bg-neutral-100 text-neutral-500",
};

export function Cart({ items, shipTos }: { items: CatalogItem[]; shipTos: ShipToOption[] }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [shipToId, setShipToId] = useState(shipTos[0]?.id ?? "");
  const [poNumber, setPoNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"submit" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = items
    .filter((i) => i.badge !== "out")
    .map((i) => ({ skuId: i.skuId, qty: Number(qty[i.skuId] || 0) }))
    .filter((l) => l.qty > 0);

  const subtotalCents = lines.reduce((sum, l) => {
    const item = items.find((i) => i.skuId === l.skuId);
    return sum + (item ? item.unitPriceCents * l.qty : 0);
  }, 0);

  async function createDraft() {
    return (await command(breweryId, "portal_create_order", {
      shipToId,
      poNumber: poNumber || undefined,
      note: note || undefined,
      lines,
    })) as { id: string };
  }

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    try {
      const order = await createDraft();
      router.push(`/portal/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "portal_create_order failed");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    try {
      const order = await createDraft();
      await command(breweryId, "portal_submit_order", { orderId: order.id });
      router.push(`/portal/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "order submission failed");
    } finally {
      setBusy(null);
    }
  }

  const disabled = !shipToId || lines.length === 0 || busy !== null;

  return (
    <div className="flex flex-col gap-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-normal">Product</th>
            <th className="py-1 font-normal">SKU</th>
            <th className="py-1 font-normal">Price</th>
            <th className="py-1 font-normal" />
            <th className="py-1 font-normal">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const out = i.badge === "out";
            return (
              <tr key={i.skuId} className="border-t">
                <td className="py-1">{i.product}</td>
                <td className="py-1">{i.name}</td>
                <td className="py-1">${(i.unitPriceCents / 100).toFixed(2)}</td>
                <td className="py-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${BADGE_STYLE[i.badge]}`}>
                    {i.badge === "in" ? "in stock" : i.badge === "low" ? "low stock" : "out of stock"}
                  </span>
                </td>
                <td className="py-1">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="w-20"
                    disabled={out}
                    value={qty[i.skuId] ?? ""}
                    onChange={(e) => setQty((prev) => ({ ...prev, [i.skuId]: e.target.value }))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex flex-col gap-4 rounded-lg border p-4 max-w-sm">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ship-to">Ship to</Label>
          <Select value={shipToId} onValueChange={setShipToId}>
            <SelectTrigger id="ship-to">
              <SelectValue placeholder="Select a ship-to" />
            </SelectTrigger>
            <SelectContent>
              {shipTos.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="po-number">PO number</Label>
          <Input id="po-number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="note">Note</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground">
          Subtotal: ${(subtotalCents / 100).toFixed(2)}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={disabled} onClick={saveDraft}>
            {busy === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" disabled={disabled} onClick={submit}>
            {busy === "submit" ? "Submitting…" : "Submit order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
