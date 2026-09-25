"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NewOrderView } from "@/components/mgr/views/new-order";
import Link from "next/link";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { defaultShipToId, isCompleteLine, orderFormReadiness, skuPickerChannel, toSkuOption } from "@/lib/order-form-rules";

type OrderKind = "wholesale" | "taproom_transfer";

export type CustomerOption = {
  id: string;
  name: string;
  sale_channel_id: string;
  shipTos: { id: string; label: string; is_default?: boolean }[];
};
export type LocationOption = { id: string; name: string; kind: "warehouse" | "taproom" };
export type SkuOption = { id: string; label: string };
export type SkuRow = { id: string; name: string; active: boolean; brands: { name: string } | null };

type LineRow = { skuId: string; qty: string };

export function OrderForm({
  customers,
  locations,
  skus,
  feedback,
}: {
  customers: CustomerOption[];
  locations: LocationOption[];
  skus: SkuOption[];
  feedback?: ReactNode;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<OrderKind>("wholesale");
  const [customerId, setCustomerId] = useState("");
  const [shipToId, setShipToId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [lines, setLines] = useState<LineRow[]>([{ skuId: "", qty: "" }]);

  const customer = customers.find((c) => c.id === customerId);
  const shipTos = customer?.shipTos ?? [];
  // A wholesale line must be priced on the customer's channel (#490), so the
  // picker offers only those SKUs once a customer is chosen.
  const channel = skuPickerChannel(kind, customer);
  const priced = useCommandQuery<SkuRow[]>("list_skus", { saleChannelId: channel }, channel !== undefined);
  const skuOptions = channel === undefined ? skus : (priced.data ?? []).map(toSkuOption);
  const readiness = orderFormReadiness({
    kind, customerId, shipToId, fromLocationId, toLocationId, lines,
    catalog: { customers: customers.length, locations: locations.length, skus: skus.length },
  });

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
        .filter(isCompleteLine)
        .map((l) => ({ skuId: l.skuId, qty: Number(l.qty) })),
    }),
    reset,
    onSuccess: data => router.push(`/orders/${(data as { order_id: string }).order_id}`),
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
    <form onSubmit={form.submit} className="contents" aria-describedby={readiness.hint ? "order-form-hint" : undefined}>
      <NewOrderView feedback={feedback} model={{
        kind, customer: customerId, shipTo: shipToId, source: fromLocationId, destination: toLocationId,
        customers: customers.map(customer => ({ id: customer.id, label: customer.name })),
        shipTos, sources: locations.map(location => ({ id: location.id, label: location.name })), skus: skuOptions,
        requestedShip: requestedShipDate, po: poNumber, backHref: "/orders",
        lines: lines.map(line => ({ ...line, name: skuOptions.find(sku => sku.id === line.skuId)?.label ?? "", warning: false })),
      }} controls={{
        kind: setKind, customer: value => { setCustomerId(value); setShipToId(defaultShipToId(customers.find(customer => customer.id === value)?.shipTos ?? [])); },
        shipTo: setShipToId, source: setFromLocationId, destination: setToLocationId,
        requestedShip: setRequestedShipDate, po: setPoNumber,
        lineSku: (index, skuId) => updateLine(index, { skuId }), lineQty: (index, qty) => updateLine(index, { qty }),
        addLine, removeLine,
      }} messages={<>
        {readiness.hint && <p id="order-form-hint" className="text-sm text-muted-foreground">
          {readiness.hint} Go to <Link href="/customers" className="underline">Customers</Link> or <Link href="/catalog" className="underline">Catalog</Link>.
        </p>}
        <CommandFormMessage error={form.error} />
      </>} submitting={form.submitting} disabled={!readiness.submittable} />
    </form>
  );
}
