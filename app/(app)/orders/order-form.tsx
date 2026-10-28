"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NewOrderView } from "@/components/mgr/views/new-order";
import Link from "next/link";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { breweryDate } from "@/lib/date-format";
import { defaultShipToId, initialOrderChoices, isBlankLine, isUnavailableSku, orderFormReadiness, skuPickerChannel, toSkuOption } from "@/lib/order-form-rules";

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
  timeZone,
  feedback,
  linkedCustomerId,
}: {
  customers: CustomerOption[];
  locations: LocationOption[];
  skus: SkuOption[];
  timeZone: string;
  feedback?: ReactNode;
  /** `?customerId=` from the link that opened New order; see initialOrderChoices. */
  linkedCustomerId?: string;
}) {
  const router = useRouter();
  const initial = initialOrderChoices(customers, locations, linkedCustomerId);
  const [kind, setKind] = useState<OrderKind>("wholesale");
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [shipToId, setShipToId] = useState(initial.shipToId);
  const [fromLocationId, setFromLocationId] = useState(initial.fromLocationId);
  const [toLocationId, setToLocationId] = useState("");
  const [requestedShipDate, setRequestedShipDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [pickup, setPickup] = useState(false);
  const [lines, setLines] = useState<LineRow[]>([{ skuId: "", qty: "" }]);

  const customer = customers.find((c) => c.id === customerId);
  const shipTos = customer?.shipTos ?? [];
  // A wholesale line must be priced on the customer's channel (#490), so the
  // picker offers only those SKUs once a customer is chosen.
  const channel = skuPickerChannel(kind, customer);
  const priced = useCommandQuery<SkuRow[]>("list_skus", { saleChannelId: channel }, channel !== undefined);
  const skuOptions = channel === undefined ? skus : (priced.data ?? []).map(toSkuOption);
  // A cold channel read is not an empty list; retain inputs but block submission until it resolves.
  const skuOptionsReady = channel === undefined || priced.data !== undefined;
  const availableSkuIds = skuOptions.map(sku => sku.id);
  const skuFeedback = channel === undefined ? undefined : <QueryFeedback timeZone={timeZone} showCheckedAt={false}
    error={priced.error} loading={!priced.data ? "Loading customer-priced SKUs" : undefined}
    paused={priced.isPaused} fetching={priced.isFetching} updatedAt={priced.dataUpdatedAt}
    retry={() => void priced.refetch()} />;
  const readiness = orderFormReadiness({
    kind, customerId, shipToId, fromLocationId, toLocationId, lines, availableSkuIds,
    catalog: { customers: customers.length, locations: locations.length, skus: skus.length },
  });
  const blocked = !skuOptionsReady || !readiness.submittable;

  function reset() {
    setKind("wholesale");
    setCustomerId(initial.customerId);
    setShipToId(initial.shipToId);
    setFromLocationId(initial.fromLocationId);
    setToLocationId("");
    setRequestedShipDate("");
    setPoNumber("");
    setPickup(false);
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
      pickup: kind === "wholesale" && pickup,
      lines: lines
        .filter(line => !isBlankLine(line))
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
    <form onSubmit={event => {
      // Guard keyboard/programmatic submits too; a disabled button alone is not the boundary.
      if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
      void form.submit(event);
    }} className="contents" aria-describedby={readiness.hint ? "order-form-hint" : undefined}>
      <NewOrderView feedback={feedback} skuFeedback={skuFeedback} skuOptionsReady={skuOptionsReady}
        skuEmptyMessage={channel === undefined || !skus.length ? undefined : "No active SKUs are priced for this customer. Check Price groups or choose another customer."} model={{
        kind, customer: customerId, shipTo: shipToId, source: fromLocationId, destination: toLocationId,
        customers: customers.map(customer => ({ id: customer.id, label: customer.name })),
        shipTos, sources: locations.map(location => ({ id: location.id, label: location.name })), skus: skuOptions,
        requestedShip: requestedShipDate, today: breweryDate(timeZone), po: poNumber, pickup, backHref: "/orders", customersHref: "/customers", catalogHref: "/catalog",
        lines: lines.map(line => ({ ...line,
          name: skuOptions.find(sku => sku.id === line.skuId)?.label ?? skus.find(sku => sku.id === line.skuId)?.label ?? (line.skuId ? "Selected SKU" : ""),
          skuError: skuOptionsReady && isUnavailableSku(line.skuId, availableSkuIds) ? "This SKU is unavailable for this order. Choose an available SKU or remove this line." : undefined,
          warning: false })),
      }} controls={{
        kind: setKind, customer: value => { setCustomerId(value); setShipToId(defaultShipToId(customers.find(customer => customer.id === value)?.shipTos ?? [])); },
        shipTo: setShipToId, source: setFromLocationId, destination: setToLocationId,
        requestedShip: setRequestedShipDate, po: setPoNumber, pickup: setPickup,
        lineSku: (index, skuId) => updateLine(index, { skuId }), lineQty: (index, qty) => updateLine(index, { qty }),
        addLine, removeLine,
      }} messages={<>
        {readiness.hint && <p id="order-form-hint" className="text-sm text-muted-foreground">
          {readiness.hint} {readiness.goTo.map(part => typeof part === "string" ? part : <Link key={part.href} href={part.href} className="underline">{part.label}</Link>)}
        </p>}
        <CommandFormMessage error={form.error} />
      </>} submitting={form.submitting} disabled={blocked} reason={readiness.reason} />
    </form>
  );
}
