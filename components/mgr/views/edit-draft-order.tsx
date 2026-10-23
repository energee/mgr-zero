// Shared saved-draft editor; inventory supplies fixtures, staff supplies authorized save effects.
// A line it cannot save marks its SKU or its quantity, with the message under
// the row, once the user leaves the quantity (draftLineErrors, #1121).
"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Button } from "@/components/ui/button";
import { LineErrorMessages, lineErrorIds, OrderSkuPicker, OrderQuantity, PickupSwitch } from "./new-order";
import { draftLineErrors } from "@/lib/order-form-rules";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

export type EditDraftOrderModel = {
  title: string;
  customer: string;
  kind: "wholesale" | "taproom_transfer";
  shipToId: string;
  shipTos: { id: string; label: string }[];
  requestedShipDate: string;
  poNumber: string;
  pickup: boolean;
  lines: { skuId: string; qty: string }[];
  skus: { id: string; label: string }[];
  backHref?: string;
};
export type DraftOrderChanges = {
  shipToId?: string;
  requestedShipDate: string | null;
  poNumber: string;
  pickup?: boolean;
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
  const [pickup, setPickup] = useState(model.pickup);
  const [lines, setLines] = useState(model.lines);
  const errorPrefix = useId();
  const touched = useTouchedLines(!onSave);
  const lineErrors = draftLineErrors(lines, model.skus.map(sku => sku.id));
  const ready = lines.length > 0 && lineErrors.every(errors => !errors.sku && !errors.qty)
    && (model.kind !== "wholesale" || model.shipTos.some(shipTo => shipTo.id === shipToId));
  function updateLine(index: number, patch: Partial<EditDraftOrderModel["lines"][number]>) {
    setLines(previous => previous.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (!ready || busy) return;
    onSave?.({ shipToId: model.kind === "wholesale" ? shipToId : undefined, requestedShipDate: requestedShipDate || null, poNumber, pickup: model.kind === "wholesale" ? pickup : undefined, lines: lines.map(line => ({ skuId: line.skuId, qty: Number(line.qty) })) });
  }}>
    {E.back("Order", "Edit draft", undefined, model.backHref)}
    {E.fld("Order", model.title)}
    {E.fld(model.kind === "wholesale" ? "Customer" : "Kind", model.customer)}
    {model.kind === "wholesale" && E.pick("Ship-to", shipToId, model.shipTos.map(option => ({ value: option.id, label: option.label })), { onChange: setShipToId, disabled: busy, required: true })}
    {E.edit("Requested ship", requestedShipDate, "date", undefined, { onChange: setRequestedShipDate, disabled: busy })}
    {E.edit("Customer PO", poNumber, "text", undefined, { onChange: setPoNumber, disabled: busy })}
    {model.kind === "wholesale" && <PickupSwitch on={pickup} onChange={setPickup} disabled={busy} />}
    {lines.map((line, index) => {
      const errors = touched.shown(index) ? lineErrors[index] : {};
      const ids = lineErrorIds(`${errorPrefix}-${index}`, errors);
      return <div key={index}>
      {E.row(<OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId} options={model.skus} invalid={Boolean(errors.sku)} errorId={ids.sku} onChange={value => updateLine(index, { skuId: value })} />,
        "", <OrderQuantity contextualLabels label={`Line ${index + 1} quantity`} value={line.qty} onChange={qty => updateLine(index, { qty })} onBlur={() => touched.touch(index)} required invalid={Boolean(errors.qty)} errorId={ids.qty} />)}
      <LineErrorMessages id={`${errorPrefix}-${index}`} errors={errors} />
      {lines.length > 1 && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setLines(previous => previous.filter((_, i) => i !== index)); touched.remove(index); }}>Remove</Button>}
    </div>;
    })}
    <Button type="button" variant="ghost" className="w-fit" disabled={busy} onClick={() => setLines(previous => [...previous, { skuId: "", qty: "" }])}>Add line</Button>
    {!ready && E.info("Choose an available SKU once and a quantity of at least 0.01 for every line, or remove the invalid line.")}
    {E.info("Saving keeps this order a draft and refreshes line prices. Submit from the order when ready.")}
    <CommandFormMessage error={error} />
    {E.sp()}
    <Button type="submit" className="w-full md:w-fit md:self-end" disabled={busy || !ready}>{busy ? "Saving..." : "Save draft"}</Button>
  </form>;
}
