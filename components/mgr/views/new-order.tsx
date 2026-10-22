// components/mgr/views/new-order.tsx — shared New order sheet body, and the
// order line controls (SKU picker, quantity, Pickup) other order views reuse.
// A started line that cannot be saved is marked at its quantity (#1121).
"use client";

import { useId, type ReactNode } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { SearchPick } from "@/components/mgr/search-pick";
import { orderLineError } from "@/lib/order-form-rules";
import { DatePicker } from "@/components/mgr/date-picker";
import type { NewOrderViewModel, OrderOption } from "@/lib/mgr/new-order-view";
import { Fragment } from "react";

export type { NewOrderViewModel };
export type NewOrderControls = {
  customer?: (value: string) => void; shipTo?: (value: string) => void;
  source?: (value: string) => void; destination?: (value: string) => void;
  kind?: (value: "wholesale" | "taproom_transfer") => void;
  requestedShip?: (value: string) => void; po?: (value: string) => void;
  pickup?: (value: boolean) => void;
  lineSku?: (index: number, value: string) => void;
  lineQty?: (index: number, value: string) => void;
  addLine?: () => void; removeLine?: (index: number) => void;
};

function OrderPick({ label, value, options, onChange, empty }: { label: string; value: string; options: OrderOption[]; onChange?: (value: string) => void; empty?: PickEmpty }) {
  return E.pick(label, value, options.map(option => typeof option === "string" ? option : { value: option.id, label: option.label }), { onChange, placeholder: label, empty });
}

// The adapter supplies options and request feedback. SearchPick keeps pending
// reads from looking empty and retained unavailable selections labelled.
// Called as a function so it still returns SearchPick's CommandForm element.
export function OrderSkuPicker({ options, ...props }: { value: string; label: string; options: { id: string; label: string }[]; onChange?: (id: string) => void; selectedLabel?: string; feedback?: ReactNode; optionsReady?: boolean; emptyMessage?: string; errorId?: string }) {
  return SearchPick({ ...props, options: options.map(option => ({ value: option.id, label: option.label })), title: "Select SKU", placeholder: "Select SKU", searchPlaceholder: "Search SKUs", noMatchMessage: "No matching SKUs" });
}

/** `error` says what is wrong with the quantity under the field (#1121); `invalid` only marks it. */
export function OrderQuantity({ value, label, onChange, contextualLabels = false, max, step = "any", required = false, invalid = false, error }: { value: string | number; label: string; onChange?: (value: string) => void; contextualLabels?: boolean; max?: number; step?: string; required?: boolean; invalid?: boolean; error?: string }) {
  const id = useId();
  return E.edit(label, String(value), "number", undefined, { onChange, min: 0, max, step, required, "aria-invalid": invalid || undefined, contextualLabels, hideLabel: true, id: error ? id : undefined, error });
}

/** A wholesale order the customer collects; it is never put on a route. Shared by New order and Edit draft. */
export function PickupSwitch({ on, onChange, disabled = false }: { on: boolean; onChange?: (value: boolean) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled}>{E.row("Pickup", "The customer collects it, so it never goes on a route", E.sw(on, "Pickup", onChange))}</fieldset>;
}

/** SKU request feedback is shared by the line list and its picker surface. */
export function NewOrderView({ model, controls = {}, messages, feedback, skuFeedback, skuOptionsReady = true, skuEmptyMessage, footer, submitting = false, disabled = false }: { model: NewOrderViewModel; controls?: NewOrderControls; messages?: ReactNode; feedback?: ReactNode; skuFeedback?: ReactNode; skuOptionsReady?: boolean; skuEmptyMessage?: string; footer?: ReactNode; submitting?: boolean; disabled?: boolean }) {
  const errorPrefix = useId();
  const lineErrors = model.lines.map((line, index) => orderLineError({ skuId: line.skuId ?? line.name, qty: String(line.qty) }, index, model.lines.length));
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
        : <OrderPick key="customer" label="Customer" value={model.customer} options={model.customers} onChange={controls.customer} empty={{ text: "No customers yet.", label: "Add a customer", href: model.customersHref, to: "Customers" }} />,
      model.kind === "taproom_transfer" ? null :
        <Fragment key={"ship-to"}>{E.pick("Ship-to", model.shipTo, [{ value: "", label: (model.customer ? "Select ship-to" : "Select a customer first") }, ...(model.shipTos.map(option => ({ value: typeof option === "string" ? option : option.id, label: (typeof option === "string" ? option : option.label) })))], { onChange: controls.shipTo, disabled: !model.customer })}</Fragment>,
      <OrderPick key="source" label="Source location" value={model.source} options={model.sources} onChange={controls.source} />,
      <DatePicker key="date" label="Requested ship" value={controls.requestedShip ? model.requestedShip : undefined} defaultValue={model.requestedShip} onChange={controls.requestedShip} />,
    )}
    {E.edit("Customer PO", model.po, "text", undefined, { onChange: controls.po })}
    {model.kind === "taproom_transfer" ? null : <PickupSwitch on={Boolean(model.pickup)} onChange={controls.pickup} />}
    {skuFeedback}
    {model.lines.map((line, index) => <div key={index}>
      {E.row(
        <OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId ?? line.name} options={skus} selectedLabel={line.name} feedback={skuFeedback} optionsReady={skuOptionsReady} emptyMessage={skuEmptyMessage} errorId={line.skuError ? `${errorPrefix}-sku-${index}` : undefined} onChange={controls.lineSku && (value => controls.lineSku?.(index, value))} />,
        line.atp == null ? "" : `ATP ${line.atp} at ${sourceLabel}`,
        <OrderQuantity contextualLabels label={`Line ${index + 1} quantity`} value={line.qty} error={lineErrors[index]} onChange={controls.lineQty && (value => controls.lineQty?.(index, value))} />,
        line.warning ? "w" : "",
      )}
      {line.skuError && <p id={`${errorPrefix}-sku-${index}`} role="alert" className="text-sm text-destructive">{line.skuError}</p>}
      {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => controls.removeLine?.(index)}>Remove</Button>}
    </div>)}
    <Button type="button" variant="ghost" className="w-fit" onClick={controls.addLine}>Add line</Button>
    {E.info("Order number is assigned on commit.")}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled || lineErrors.some(Boolean)}>{submitting ? "Saving…" : "Save draft"}</Button>}
  </>;
}
