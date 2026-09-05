// app/(portal)/portal/cart.tsx — client cart for the catalog page. Qty state
// keyed by skuId; "out" badge rows are disabled (qty forced to 0). Submit
// chains portal_create_order then portal_submit_order — the draft it creates
// along the way is an implementation detail, never shown to the customer, as
// long as both calls succeed. If portal_create_order succeeds but
// portal_submit_order fails, the created order id is kept in `draftId` so a
// retry (Save draft or Submit) reuses it and calls portal_submit_order again
// rather than calling portal_create_order a second time — that would leave
// an orphan duplicate draft behind. The error shown in that case links to
// the saved draft so the customer isn't left wondering if anything happened.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function submissionFailureMessage(message: string, draftId: string | null) {
  return draftId
    ? `Order saved, but submission could not be confirmed (${message}). View the order status before retrying, or contact the brewery.`
    : message;
}

export function Cart({ items, shipTos }: { items: CatalogItem[]; shipTos: ShipToOption[] }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [shipToId, setShipToId] = useState(shipTos[0]?.id ?? "");
  const [poNumber, setPoNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"submit" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const lines = items
    .filter((i) => i.badge !== "out")
    .map((i) => ({ skuId: i.skuId, qty: Number(qty[i.skuId] || 0) }))
    .filter((l) => l.qty > 0);

  const subtotalCents = lines.reduce((sum, l) => {
    const item = items.find((i) => i.skuId === l.skuId);
    return sum + (item ? item.unitPriceCents * l.qty : 0);
  }, 0);

  // Reuses `draftId` if a previous attempt already created the order, so a
  // retry never calls portal_create_order twice for the same cart.
  async function ensureDraft(): Promise<string> {
    if (draftId) return draftId;
    // create_order (the underlying plpgsql fn) returns jsonb keyed
    // order_id, not id — see lib/commands/portal.ts's portal_create_order.
    const order = (await command(breweryId, "portal_create_order", {
      shipToId,
      poNumber: poNumber || undefined,
      note: note || undefined,
      lines,
    })) as { order_id: string };
    setDraftId(order.order_id);
    return order.order_id;
  }

  async function saveDraft() {
    setBusy("draft");
    setError(null);
    try {
      const id = await ensureDraft();
      router.push(`/portal/orders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "portal_create_order failed");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    let savedId = draftId;
    try {
      savedId = await ensureDraft();
      await command(breweryId, "portal_submit_order", { orderId: savedId });
      router.push(`/portal/orders/${savedId}`);
    } catch (err) {
      // A transport failure does not prove whether portal_submit_order
      // committed. The saved order id is still available for status recovery.
      const message = err instanceof Error ? err.message : "order submission failed";
      setError(submissionFailureMessage(message, savedId));
    } finally {
      setBusy(null);
    }
  }

  const disabled = !shipToId || (lines.length === 0 && !draftId) || busy !== null;

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
              <SelectGroup>
                {shipTos.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
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
        {error && (
          <p className="text-sm text-red-600">
            {error}
            {draftId && (
              <>
                {" "}
                <Link href={`/portal/orders/${draftId}`} className="underline">
                  View order status
                </Link>
              </>
            )}
          </p>
        )}
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
