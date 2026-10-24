// components/mgr/views/new-order.tsx — shared New order sheet body, and the
// order line controls (SKU picker, quantity, Pickup, a line's errors) other
// order views reuse. A started line that cannot be saved marks its SKU or its
// quantity, with the message under the row, once the user leaves the
// quantity (#1121); Save draft names what is still needed (#1122).
"use client";

import { useId, type FocusEventHandler, type ReactNode } from "react";
import { describedBy, E, type PickEmpty } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { SearchPick } from "@/components/mgr/search-pick";
import { orderLineError, type LineErrors } from "@/lib/order-form-rules";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
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
  // The id ties the label, and an empty note, to the trigger.
  const id = useId();
  return E.pick(label, value, options.map(option => typeof option === "string" ? option : { value: option.id, label: option.label }), { id, onChange, placeholder: label, empty });
}

// The adapter supplies options and request feedback. SearchPick keeps pending
// reads from looking empty and retained unavailable selections labelled.
// Called as a function so it still returns SearchPick's CommandForm element.
export function OrderSkuPicker({ options, catalogHref, emptyMessage = catalogHref ? <>No active SKUs yet. {E.link("Add a SKU", "Catalog", catalogHref)}</> : "No SKUs available for this order.", ...props }: { value: string; label: string; options: { id: string; label: string }[]; onChange?: (id: string) => void; selectedLabel?: string; feedback?: ReactNode; optionsReady?: boolean; emptyMessage?: ReactNode; catalogHref?: string; errorId?: string; invalid?: boolean }) {
  return SearchPick({ ...props, emptyMessage, options: options.map(option => ({ value: option.id, label: option.label })), title: "Select SKU", placeholder: "Select SKU", searchPlaceholder: "Search SKUs", noMatchMessage: "No matching SKUs" });
}

/** `invalid` marks the quantity; `errorId` names the message that says why,
 *  drawn by the caller under the row (LineErrorMessages), since a row's
 *  quantity cell is too narrow for a sentence. */
export function OrderQuantity({ value, label, onChange, onBlur, contextualLabels = false, max, step = "any", required = false, invalid = false, errorId }: { value: string | number; label: string; onChange?: (value: string) => void; onBlur?: FocusEventHandler<HTMLInputElement>; contextualLabels?: boolean; max?: number; step?: string; required?: boolean; invalid?: boolean; errorId?: string }) {
  return E.edit(label, String(value), "number", undefined, { onChange, onBlur, min: 0, max, step, required, "aria-invalid": invalid || undefined, "aria-describedby": errorId, contextualLabels, hideLabel: true });
}

/** The ids a line's controls point at: `${id}-sku-error` and `${id}-qty-error`. */
export const lineErrorIds = (id: string, errors: LineErrors) => ({
  sku: errors.sku ? `${id}-sku-error` : undefined,
  qty: errors.qty ? `${id}-qty-error` : undefined,
});

/** A line's messages, full width under its row; each is the FieldError its own
 *  control describes itself by (lineErrorIds). Shared by order, PO and transfer lines. */
export function LineErrorMessages({ id, errors }: { id: string; errors: LineErrors }) {
  const ids = lineErrorIds(id, errors);
  return <>
    {errors.sku && <FieldError id={ids.sku}>{errors.sku}</FieldError>}
    {errors.qty && <FieldError id={ids.qty}>{errors.qty}</FieldError>}
  </>;
}

/** A wholesale order the customer collects; it is never put on a route. Shared by New order and Edit draft. */
export function PickupSwitch({ on, onChange, disabled = false }: { on: boolean; onChange?: (value: boolean) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled}>{E.row("Pickup", "The customer collects it, so it never goes on a route", E.sw(on, "Pickup", onChange))}</fieldset>;
}

/** SKU request feedback is shared by the line list and its picker surface.
 *  `reason` (orderFormReadiness) withholds Save draft and is printed beside it;
 *  `disabled` withholds it without one, while SKU options load or a setup hint shows. */
export function NewOrderView({ model, controls = {}, messages, feedback, skuFeedback, skuOptionsReady = true, skuEmptyMessage, footer, submitting = false, disabled = false, reason }: { model: NewOrderViewModel; controls?: NewOrderControls; messages?: ReactNode; feedback?: ReactNode; skuFeedback?: ReactNode; skuOptionsReady?: boolean; skuEmptyMessage?: string; footer?: ReactNode; submitting?: boolean; disabled?: boolean; reason?: string | null }) {
  const errorPrefix = useId();
  const touched = useTouchedLines(!controls.lineQty);
  const lineErrors = model.lines.map((line, index) => touched.shown(index) ? orderLineError({ skuId: line.skuId ?? line.name, qty: String(line.qty) }, index, model.lines.length) : {});
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
    {model.lines.map((line, index) => {
      const errors = lineErrors[index];
      const ids = lineErrorIds(`${errorPrefix}-line-${index}`, errors);
      const unavailableId = line.skuError ? `${errorPrefix}-sku-${index}` : undefined;
      return <div key={index}>
      {E.row(
        <OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId ?? line.name} options={skus} catalogHref={model.catalogHref ?? "#"} selectedLabel={line.name} feedback={skuFeedback} optionsReady={skuOptionsReady} emptyMessage={skuEmptyMessage} errorId={describedBy(unavailableId, ids.sku)} invalid={Boolean(errors.sku)} onChange={controls.lineSku && (value => controls.lineSku?.(index, value))} />,
        line.atp == null ? "" : `ATP ${line.atp} at ${sourceLabel}`,
        <OrderQuantity contextualLabels label={`Line ${index + 1} quantity`} value={line.qty} invalid={Boolean(errors.qty)} errorId={ids.qty} onBlur={() => touched.touch(index)} onChange={controls.lineQty && (value => controls.lineQty?.(index, value))} />,
        line.warning ? "w" : "",
      )}
      <LineErrorMessages id={`${errorPrefix}-line-${index}`} errors={errors} />
      {line.skuError && <p id={unavailableId} role="alert" className="text-sm text-destructive">{line.skuError}</p>}
      {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => { controls.removeLine?.(index); touched.remove(index); }}>Remove</Button>}
    </div>;
    })}
    <Button type="button" variant="ghost" className="w-fit" onClick={controls.addLine}>Add line</Button>
    {E.info("Order number is assigned when you save the draft.")}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : E.pin(E.submit("Save draft", { submitting, disabled, reason }))}
  </>;
}
