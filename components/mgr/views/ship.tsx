"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrderQuantity } from "./new-order";
import type { ShipViewModel } from "@/lib/mgr/ship-view";

export function ShipView({ model, sources, footer, tape, invoiceTiming, quantities, onQuantity, reasons, onReason, carrier = "", tracking = "", onCarrier, onTracking, onInvoiceTiming, messages, submitting = false, reason }: {
  model: ShipViewModel; sources?: ReactNode; footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][]; invoiceTiming?: number;
  quantities?: Record<string, string>; onQuantity?: (key: string, value: string) => void;
  /** Shortage reason per line key; a line shipped below picked asks for one. */
  reasons?: Record<string, string>; onReason?: (key: string, value: string) => void;
  carrier?: string; tracking?: string; onCarrier?: (value: string) => void; onTracking?: (value: string) => void;
  onInvoiceTiming?: (timing: "now" | "on_delivery") => void;
  /** Why Ship order is withheld, printed beside it; absent when ready. */
  messages?: ReactNode; submitting?: boolean; reason?: string | null;
}) {
  const timing = model.pickup ? 0 : invoiceTiming ?? (model.invoiceTiming === "on_delivery" ? 1 : 0);
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.fld("Fulfillment source", model.fulfillmentSource)}
    {model.lines.map(line => <div key={line.key}>{E.row(line.name, line.detail,
      <OrderQuantity label={`${line.name} shipped quantity`} value={quantities?.[line.key] ?? line.qty} max={line.picked} step="0.01" required onChange={onQuantity && (value => onQuantity(line.key, value))} />, line.tone ?? "")}
      {line.tone === "w" && E.edit("Reason · required", reasons?.[line.key] ?? line.shortReason ?? "", "text", undefined, {
        required: true, placeholder: "Why this line ships short", "aria-label": `${line.name} shortage reason`,
        onChange: onReason && (value => onReason(line.key, value)),
      })}</div>)}
    {model.shortNote && E.info(model.shortNote)}
    {E.edit("Carrier", carrier, "text", undefined, { onChange: onCarrier, placeholder: "optional" })}
    {E.edit("Tracking", tracking, "text", undefined, { onChange: onTracking, placeholder: "optional" })}
    <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" value={onInvoiceTiming ? String(timing) : undefined} defaultValue={onInvoiceTiming ? undefined : String(timing)}
      onValueChange={value => { if (value !== "") onInvoiceTiming?.(value === "1" ? "on_delivery" : "now"); }}>
      <ToggleGroupItem value="0">Invoice now</ToggleGroupItem>{!model.pickup && <ToggleGroupItem value="1">On delivery</ToggleGroupItem>}
    </ToggleGroup>
    {model.pickup && E.info("A pickup order is invoiced when it ships.")}
    {E.tape(tape ?? model.tape)}
    {sources}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <IrreversibleSubmit label="Ship order" reason={reason} submitting={submitting} busy="Shipping…" className="w-full md:w-fit md:self-end" />}
  </>;
}
