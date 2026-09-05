// app/(app)/orders/order-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the create_order command.
// Customer selection cascades to that customer's ship-tos (data pre-loaded by
// the server page, no extra round trip); kind toggles wholesale (customer +
// ship-to) vs taproom transfer (to-location only), per the orders check
// constraint in 00001_baseline.sql. Line editor is a simple add/remove list
// of sku + qty rows.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type OrderKind = "wholesale" | "taproom_transfer";

export type CustomerOption = {
  id: string;
  name: string;
  shipTos: { id: string; label: string }[];
};
export type LocationOption = { id: string; name: string; kind: "warehouse" | "taproom" };
export type SkuOption = { id: string; label: string };

type LineRow = { skuId: string; qty: string };

export function OrderForm({
  customers,
  locations,
  skus,
}: {
  customers: CustomerOption[];
  locations: LocationOption[];
  skus: SkuOption[];
}) {
  const [kind, setKind] = useState<OrderKind>("wholesale");
  const [customerId, setCustomerId] = useState("");
  const [shipToId, setShipToId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [lines, setLines] = useState<LineRow[]>([{ skuId: "", qty: "" }]);

  const shipTos = customers.find((c) => c.id === customerId)?.shipTos ?? [];

  function reset() {
    setKind("wholesale");
    setCustomerId("");
    setShipToId("");
    setFromLocationId("");
    setToLocationId("");
    setRequestedShipDate("");
    setPoNumber("");
    setLines([{ skuId: "", qty: "" }]);
  }

  const form = useCommandForm("create_order", {
    build: () => ({
      kind,
      customerId: kind === "wholesale" ? customerId : undefined,
      shipToId: kind === "wholesale" ? shipToId : undefined,
      fromLocationId,
      toLocationId: kind === "taproom_transfer" ? toLocationId : undefined,
      requestedShipDate: requestedShipDate || undefined,
      poNumber: poNumber || undefined,
      lines: lines
        .filter((l) => l.skuId && l.qty)
        .map((l) => ({ skuId: l.skuId, qty: Number(l.qty) })),
    }),
    reset,
  });

  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { skuId: "", qty: "" }]);
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Order" trigger={<Button>New Order</Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="order-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OrderKind)}>
              <SelectTrigger id="order-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="taproom_transfer">Taproom transfer</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {kind === "wholesale" ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="order-customer">Customer</Label>
                <Select
                  value={customerId}
                  onValueChange={(v) => {
                    setCustomerId(v);
                    setShipToId("");
                  }}
                >
                  <SelectTrigger id="order-customer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="order-ship-to">Ship-to</Label>
                <Select value={shipToId} onValueChange={setShipToId}>
                  <SelectTrigger id="order-ship-to">
                    <SelectValue placeholder={customerId ? "Select ship-to" : "Select a customer first"} />
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
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="order-to-location">To location</Label>
              <Select value={toLocationId} onValueChange={setToLocationId}>
                <SelectTrigger id="order-to-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="order-from-location">From location</Label>
            <Select value={fromLocationId} onValueChange={setFromLocationId}>
              <SelectTrigger id="order-from-location">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="order-requested-date">Requested ship date</Label>
            <Input
              id="order-requested-date"
              type="date"
              value={requestedShipDate}
              onChange={(e) => setRequestedShipDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="order-po">PO number</Label>
            <Input id="order-po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Lines</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={line.skuId} onValueChange={(v) => updateLine(i, { skuId: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select SKU" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {skus.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  className="w-24"
                  value={line.qty}
                  onChange={(e) => updateLine(i, { qty: e.target.value })}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              Add line
            </Button>
          </div>

          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Creating…" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
