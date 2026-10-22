// components/mgr/views/new-transfer.tsx — shared New transfer sheet body. An
// entered line that cannot be sent is marked at its quantity (#1121); an empty
// SKU list says where SKUs are made (#1123).
"use client";
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import type { NewTransferViewModel } from "@/lib/mgr/new-transfer-view";
import { orderLineError } from "@/lib/order-form-rules";

export type { NewTransferViewModel };

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

function Pick({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean }) {
  return E.pick(label, value, options, { onChange, disabled, placeholder: label, displayValue: value || undefined });
}

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
  return (
    <>
      {E.back("Transfers", "New transfer")}
      <Pick label="From" value={model.from} options={model.fromOptions} onChange={controls.from} />
      <Pick label="From bin" value={model.fromBin} options={model.fromBinOptions} onChange={controls.fromBin} disabled={!model.from} />
      <Pick label="To" value={model.to} options={model.toOptions} onChange={controls.to} />
      <Pick label="To bin" value={model.toBin} options={model.toBinOptions} onChange={controls.toBin} disabled={!model.to} />
      <Field><FieldLabel>Lines</FieldLabel>
      {model.lines.map((line, index) => (
        <div key={`${line.title}:${index}`} className="flex gap-2">
          {E.pick(`Line ${index + 1} SKU`, line.sku ?? line.title, model.skuOptions, { onChange: controls.lineSku ? value => controls.lineSku?.(index, value) : undefined, placeholder: "SKU", displayValue: line.title || undefined, hideLabel: true, id: `${id}-sku-${index}`, empty: { text: "No SKUs yet.", label: "Add a SKU", href: model.skusHref, to: "Catalog" } })}
          {E.edit(`Line ${index + 1} qty`, String(line.qty), "number", undefined, { onChange: controls.lineQty ? (nextValue: string) => controls.lineQty?.(index, nextValue) : undefined, min: "0", step: "any", hideLabel: true, id: `${id}-qty-${index}`, error: orderLineError({ skuId: line.sku ?? line.title, qty: String(line.qty) }, index, model.lines.length) })}
          {model.lines.length > 1 ? <Button type="button" variant="ghost" onClick={() => controls.removeLine?.(index)}>Remove</Button> : null}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={controls.addLine}>Add line</Button>
      </Field>
      {messages}
      {footer !== undefined ? footer : E.btn("Create transfer")}
    </>
  );
}
