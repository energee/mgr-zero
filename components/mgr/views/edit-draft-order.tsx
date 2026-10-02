// Shared saved-draft editor; inventory supplies fixtures, staff supplies authorized save effects.
"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { OrderSkuPicker, OrderQuantity } from "./new-order";
import { isCompleteLine } from "@/lib/order-form-rules";

export type EditDraftOrderModel = {
  title: string;
  customer: string;
  kind: "wholesale" | "taproom_transfer";
  shipToId: string;
  shipTos: { id: string; label: string }[];
  requestedShipDate: string;
  poNumber: string;
  lines: { skuId: string; qty: string }[];
  skus: { id: string; label: string }[];
  backHref?: string;
};
export type DraftOrderChanges = {
  shipToId?: string;
  requestedShipDate: string | null;
  poNumber: string;
  lines: { skuId: string; qty: number }[];
};

export function EditDraftOrderView({ model, onSave, busy = false, error }: {
  model: EditDraftOrderModel;
  onSave?: (changes: DraftOrderChanges) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [shipToId, setShipToId] = useState(model.shipToId);
  const [requestedShipDate, setRequestedShipDate] = useState(model.requestedShipDate);
  const [poNumber, setPoNumber] = useState(model.poNumber);
  const [lines, setLines] = useState(model.lines);
  const lineErrors = lines.map((line, index) => {
    if (!model.skus.some(sku => sku.id === line.skuId)) return `Line ${index + 1}: choose an available SKU.`;
    if (!isCompleteLine(line) || !Number.isFinite(Number(line.qty)) || Number(line.qty) < 0.01) return `Line ${index + 1}: enter a quantity of at least 0.01.`;
    if (lines.findIndex(other => other.skuId === line.skuId) !== index) return `Line ${index + 1}: this SKU is already on another line. Combine its quantities or remove this line.`;
    return null;
  });
  const ready = lines.length > 0 && lineErrors.every(error => error === null)
    && (model.kind !== "wholesale" || model.shipTos.some(shipTo => shipTo.id === shipToId));
  function updateLine(index: number, patch: Partial<EditDraftOrderModel["lines"][number]>) {
    setLines(previous => previous.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (!ready || busy) return;
    onSave?.({ shipToId: model.kind === "wholesale" ? shipToId : undefined, requestedShipDate: requestedShipDate || null, poNumber, lines: lines.map(line => ({ skuId: line.skuId, qty: Number(line.qty) })) });
  }}>
    {E.back("Order", "Edit draft", undefined, model.backHref)}
    {E.fld("Order", model.title)}
    {E.fld(model.kind === "wholesale" ? "Customer" : "Kind", model.customer)}
    {model.kind === "wholesale" && E.pick("Ship-to", shipToId, model.shipTos.map(option => ({ value: option.id, label: option.label })), { onChange: setShipToId, disabled: busy, required: true })}
    {E.edit("Requested ship", requestedShipDate, "date", undefined, { onChange: setRequestedShipDate, disabled: busy })}
    {E.edit("Customer PO", poNumber, "text", undefined, { onChange: setPoNumber, disabled: busy })}
    {lines.map((line, index) => <div key={index}>
      {E.row(<OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId} options={model.skus} onChange={value => updateLine(index, { skuId: value })} />,
        "", <OrderQuantity contextualLabels label={`Line ${index + 1} quantity`} value={line.qty} onChange={qty => updateLine(index, { qty })} required invalid={Boolean(lineErrors[index])} />)}
      {lineErrors[index] && <p className="text-sm text-destructive" role="alert">{lineErrors[index]}</p>}
      {lines.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setLines(previous => previous.filter((_, i) => i !== index))}>Remove</Button>}
    </div>)}
    <Button type="button" variant="ghost" className="w-fit" disabled={busy} onClick={() => setLines(previous => [...previous, { skuId: "", qty: "" }])}>Add line</Button>
    {!ready && E.info("Choose an available SKU once and a quantity of at least 0.01 for every line, or remove the invalid line.")}
    {E.info("Saving keeps this order a draft and refreshes line prices. Submit from the order when ready.")}
    <CommandFormMessage error={error} />
    {E.sp()}
    <Button type="submit" className="w-full md:w-fit md:self-end" disabled={busy || !ready}>{busy ? "Saving..." : "Save draft"}</Button>
  </form>;
}
