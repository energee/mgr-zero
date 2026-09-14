"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrderQuantity } from "./new-order";
import type { ShipViewModel } from "@/lib/mgr/ship-view";

export type { ShipViewModel };

export function ShipView({ model, sources, footer, fulfillmentOptions, tape, invoiceTiming, quantities, onQuantity, carrier = "", tracking = "", onCarrier, onTracking, onInvoiceTiming, messages, submitting = false, disabled = false }: {
  model: ShipViewModel; sources?: ReactNode; footer?: ReactNode;
  fulfillmentOptions?: string[]; tape?: [ReactNode, ReactNode?][]; invoiceTiming?: number;
  quantities?: Record<string, string>; onQuantity?: (key: string, value: string) => void;
  carrier?: string; tracking?: string; onCarrier?: (value: string) => void; onTracking?: (value: string) => void;
  onInvoiceTiming?: (timing: "now" | "on_delivery") => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean;
}) {
  const timing = invoiceTiming ?? (model.invoiceTiming === "on_delivery" ? 1 : 0);
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.pick("Fulfillment source", model.fulfillmentSource, ((fulfillmentOptions ?? [model.fulfillmentSource]).map(source => ({ value: source, label: source }))), { disabled: true })}
    {model.lines.map(line => <div key={line.key}>{E.row(line.name, line.detail,
      <OrderQuantity label={`${line.name} shipped quantity`} value={quantities?.[line.key] ?? line.qty} max={line.picked} step="0.01" required onChange={onQuantity && (value => onQuantity(line.key, value))} />, line.tone ?? "")}</div>)}
    {model.shortNote && <>
      {E.edit("Reason · required", "", "text", undefined, { disabled: true, placeholder: "Shortage reason recording is not available yet", "aria-label": "Reason" })}
      {E.info(model.shortNote)}
    </>}
    {E.edit("Carrier", carrier, "text", undefined, { onChange: onCarrier, placeholder: "optional" })}
    {E.edit("Tracking", tracking, "text", undefined, { onChange: onTracking, placeholder: "optional" })}
    <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" value={onInvoiceTiming ? String(timing) : undefined} defaultValue={onInvoiceTiming ? undefined : String(timing)}
      onValueChange={value => { if (value !== "") onInvoiceTiming?.(value === "1" ? "on_delivery" : "now"); }}>
      <ToggleGroupItem value="0">Invoice now</ToggleGroupItem><ToggleGroupItem value="1">On delivery</ToggleGroupItem>
    </ToggleGroup>
    {E.tape(tape ?? model.tape)}
    {sources}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Shipping…" : "Ship order"}</Button>}
  </>;
}
