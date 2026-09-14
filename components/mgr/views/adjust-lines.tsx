"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity, OrderSkuPicker } from "./new-order";
import type { AdjustLinesViewModel } from "@/lib/mgr/adjust-lines-view";

export type { AdjustLinesViewModel };

export function AdjustLinesView({ model, footer, reason = "", onReason, onQuantity, onSku, onAdd, onRemove, messages, submitting = false }: {
  model: AdjustLinesViewModel; footer?: ReactNode; reason?: string;
  onReason?: (value: string) => void;
  onQuantity?: (index: number, value: string) => void;
  onSku?: (index: number, value: string) => void;
  onAdd?: () => void; onRemove?: (index: number) => void;
  messages?: ReactNode; submitting?: boolean;
}) {
  const skus = model.skus ?? model.lines.map(line => ({ id: line.skuId ?? line.key, label: line.name }));
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {model.lines.map((line, index) => <div key={line.key}>
      {E.row(
        <OrderSkuPicker label={`Line ${index + 1} SKU`} value={line.skuId ?? line.key} options={skus} onChange={onSku && (value => onSku(index, value))} />,
        line.detail,
        <OrderQuantity label={`Line ${index + 1} quantity`} value={line.qty} onChange={onQuantity && (value => onQuantity(index, value))} />,
        line.tone ?? "",
      )}
      {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => onRemove?.(index)}>Remove</Button>}
    </div>)}
    <Button type="button" variant="ghost" className="w-fit" onClick={onAdd}>Add line</Button>
    {E.edit("Reason", reason, "text", undefined, { onChange: onReason, required: true })}
    {messages}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Save lines"}</Button>}
  </>;
}
