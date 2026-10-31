// components/mgr/views/new-transfer.tsx — shared New transfer sheet body. It
// draws no title: the sheet it opens in (CommandForm live, ScreenSheet in the
// inventory) already names it (#1120). An
// entered line that cannot be sent marks its SKU or its quantity, with the
// message under that field once the user leaves the quantity (#1121). An empty
// SKU list says where SKUs are made, or who makes them, and a chosen location
// with no bins says so under its bin picker (#1123).
"use client";
import { useId, type ReactNode } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import type { NewTransferViewModel } from "@/lib/mgr/new-transfer-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { orderLineError } from "@/lib/order-form-rules";
import { LineErrorMessages, lineErrorIds } from "./new-order";

export type NewTransferControls = {
  from?: (value: string) => void;
  fromBin?: (value: string) => void;
  to?: (value: string) => void;
  toBin?: (value: string) => void;
  lineSku?: (index: number, value: string) => void;
  lineQty?: (index: number, value: string) => void;
  addLine?: () => void;
  removeLine?: (index: number) => void;
};

function Pick({ label, value, options, onChange, disabled, empty }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean; empty?: PickEmpty }) {
  const id = useId();
  return E.pick(label, value, options, { id, onChange, disabled, placeholder: disabled ? "Choose a location first" : label, displayValue: value || undefined, empty });
}

/** A chosen location with no bins. Bins are added on Locations, by the same
 *  Admin and Warehouse who make transfers and repacks (RepackView shares it). */
export const NO_BINS: PickEmpty = { text: "This location has no bins.", label: "Open Locations", href: "/locations", to: "Locations" };

/** An empty SKU picker's note. `href` is Catalog for a user who may create a
 *  SKU, undefined in the inventory (the link stays "#"), or null, and then the
 *  note names who can. RecordMovementView shares it. */
export const noSkus = (href: string | null | undefined): PickEmpty => href === null
  ? { text: "No SKUs yet. An admin or sales member adds them in Catalog." }
  : { text: "No SKUs yet.", label: "Add a SKU", href, to: "Catalog" };

export function NewTransferView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: NewTransferViewModel;
  controls?: NewTransferControls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  const touched = useTouchedLines(!controls.lineQty);
  return (
    <>
      <Pick label="From" value={model.from} options={model.fromOptions} onChange={controls.from} />
      <Pick label="From bin" value={model.fromBin} options={model.fromBinOptions} onChange={controls.fromBin} disabled={!model.from} empty={model.from ? NO_BINS : undefined} />
      <Pick label="To" value={model.to} options={model.toOptions} onChange={controls.to} />
      <Pick label="To bin" value={model.toBin} options={model.toBinOptions} onChange={controls.toBin} disabled={!model.to} empty={model.to ? NO_BINS : undefined} />
      <Field><FieldLabel>Lines</FieldLabel>
      {model.lines.map((line, index) => {
        const errors = touched.shown(index) ? orderLineError({ skuId: line.sku ?? line.title, qty: String(line.qty) }, index, model.lines.length) : {};
        const ids = lineErrorIds(`${id}-${index}`, errors);
        return <div key={`${line.title}:${index}`} className="flex flex-col gap-1">
          <div className="flex min-w-0 gap-2 [&>*]:min-w-0">
            {E.pick(`Line ${index + 1} SKU`, line.sku ?? line.title, model.skuOptions, { onChange: controls.lineSku ? value => controls.lineSku?.(index, value) : undefined, placeholder: "SKU", displayValue: line.title || undefined, hideLabel: true, id: `${id}-sku-${index}`, empty: noSkus(model.skusHref), "aria-invalid": errors.sku ? true : undefined, "aria-describedby": ids.sku })}
            {E.edit(`Line ${index + 1} qty`, String(line.qty), "number", undefined, { onChange: controls.lineQty ? (nextValue: string) => controls.lineQty?.(index, nextValue) : undefined, onBlur: () => touched.touch(index), min: "0", step: "any", hideLabel: true, id: `${id}-${index}-qty`, error: errors.qty })}
            {model.lines.length > 1 ? <Button type="button" variant="ghost" onClick={() => { controls.removeLine?.(index); touched.remove(index); }}>Remove</Button> : null}
          </div>
          <LineErrorMessages id={`${id}-${index}`} errors={errors} />
        </div>;
      })}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={controls.addLine}>Add line</Button>
      </Field>
      {messages}
      {footer !== undefined ? footer : E.btn("Create transfer")}
    </>
  );
}
