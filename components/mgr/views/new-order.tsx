"use client";

import { useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { CommandForm } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import type { NewOrderViewModel, OrderOption } from "@/lib/mgr/new-order-view";
import { Fragment } from "react";

export type { NewOrderViewModel };
export type NewOrderControls = {
  customer?: (value: string) => void; shipTo?: (value: string) => void;
  source?: (value: string) => void; destination?: (value: string) => void;
  kind?: (value: "wholesale" | "taproom_transfer") => void;
  requestedShip?: (value: string) => void; po?: (value: string) => void;
  lineSku?: (index: number, value: string) => void;
  lineQty?: (index: number, value: string) => void;
  addLine?: () => void; removeLine?: (index: number) => void;
};

function OrderPick({ label, value, options, onChange }: { label: string; value: string; options: OrderOption[]; onChange?: (value: string) => void }) {
  return E.pick(label, value, options.map(option => typeof option === "string" ? option : { value: option.id, label: option.label }), { onChange, placeholder: label });
}

// Options are already loaded and permission-filtered by the route. Search the
// same supplied SKU set in both render paths; selection always returns an ID.
export function OrderSkuPicker({ value, label, options, onChange }: { value: string; label: string; options: { id: string; label: string }[]; onChange?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <CommandForm title="Select SKU" open={open} onOpenChange={setOpen}
    trigger={<Button type="button" variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal text-left" aria-label={label}>{options.find(option => option.id === value)?.label ?? "Select SKU"}</Button>}>
    <Command><CommandInput placeholder="Search SKUs" /><CommandList><CommandEmpty>No matching SKUs</CommandEmpty>
      {options.map(option => <CommandItem key={option.id} value={option.id} keywords={[option.label]} onSelect={() => { onChange?.(option.id); setOpen(false); }}>{option.label}</CommandItem>)}
    </CommandList></Command>
  </CommandForm>;
}

export function OrderQuantity({ value, label, onChange, contextualLabels = false, max, step = "any", required = false, invalid = false }: { value: string | number; label: string; onChange?: (value: string) => void; contextualLabels?: boolean; max?: number; step?: string; required?: boolean; invalid?: boolean }) {
  return E.edit(label, String(value), "number", undefined, { onChange, min: 0, max, step, required, "aria-invalid": invalid || undefined, contextualLabels, hideLabel: true });
}

export function NewOrderView({ model, controls = {}, messages, feedback, footer, submitting = false, disabled = false }: { model: NewOrderViewModel; controls?: NewOrderControls; messages?: ReactNode; feedback?: ReactNode; footer?: ReactNode; submitting?: boolean; disabled?: boolean }) {
  const skus = model.skus ?? model.lines.map(line => ({ id: line.name, label: line.name }));
  const source = model.sources.find(option => typeof option !== "string" && option.id === model.source);
  const sourceLabel = typeof source === "object" ? source.label : model.source;
  return <>
    {E.back("Orders", "New order", undefined, model.backHref)}
    {feedback}
    <OrderPick label="Kind" value={model.kind ?? "wholesale"} options={[{ id: "wholesale", label: "Wholesale" }, { id: "taproom_transfer", label: "Taproom transfer" }]} onChange={controls.kind && (value => controls.kind?.(value as "wholesale" | "taproom_transfer"))} />
    {E.cols(
      model.kind === "taproom_transfer"
        ? <OrderPick key="destination" label="To location" value={model.destination ?? ""} options={model.sources} onChange={controls.destination} />
        : <OrderPick key="customer" label="Customer" value={model.customer} options={model.customers} onChange={controls.customer} />,
      model.kind === "taproom_transfer" ? null :
        <Fragment key={"ship-to"}>{E.pick("Ship-to", model.shipTo, [{ value: "", label: (model.customer ? "Select ship-to" : "Select a customer first") }, ...(model.shipTos.map(option => ({ value: typeof option === "string" ? option : option.id, label: (typeof option === "string" ? option : option.label) })))], { onChange: controls.shipTo, disabled: !model.customer })}</Fragment>,
      <OrderPick key="source" label="Source location" value={model.source} options={model.sources} onChange={controls.source} />,
      <DatePicker key="date" label="Requested ship" value={controls.requestedShip ? model.requestedShip : undefined} defaultValue={model.requestedShip} onChange={controls.requestedShip} />,
    )}
    {E.edit("Customer PO", model.po, "text", undefined, { onChange: controls.po })}
    {model.lines.map((line, index) => <div key={index}>
      {E.row(
        <OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId ?? line.name} options={skus} onChange={controls.lineSku && (value => controls.lineSku?.(index, value))} />,
        line.atp == null ? "" : `ATP ${line.atp} at ${sourceLabel}`,
        <OrderQuantity contextualLabels label={`Line ${index + 1} quantity`} value={line.qty} onChange={controls.lineQty && (value => controls.lineQty?.(index, value))} />,
        line.warning ? "w" : "",
      )}
      {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => controls.removeLine?.(index)}>Remove</Button>}
    </div>)}
    <Button type="button" variant="ghost" className="w-fit" onClick={controls.addLine}>Add line</Button>
    {E.info("Order number is assigned on commit.")}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : "Save draft"}</Button>}
  </>;
}
