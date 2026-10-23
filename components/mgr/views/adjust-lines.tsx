"use client";

// components/mgr/views/adjust-lines.tsx — Adjust lines, drawn like Pick: one
// table row per line, Product · Format · Ordered (with ✕ to remove), the brand named on
// its first row only. A line added here carries the SKU picker in Product.
// Add line, the required Reason and Save lines follow the table.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity, OrderSkuPicker } from "./new-order";
import { startsGroup } from "@/lib/mgr/brand-lines";
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
  const skus = model.skus ?? [];
  // A saved line names its brand on the brand's first row; an added line picks its SKU instead.
  const brandCell = (index: number) => (startsGroup(model.lines, index) ? E.brand(model.lines[index].group) : "");
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.tbl(["Product", "Format", "Ordered"], model.lines.map((line, index) => [
      line.added ? <OrderSkuPicker key="sku" label={`Line ${index + 1} SKU`} value={line.skuId ?? ""} options={skus} onChange={onSku && (value => onSku(index, value))} /> : brandCell(index),
      line.added ? "" : <span key="format">{line.name}{line.detail ? <span className="block text-xs text-muted-foreground">{line.detail}</span> : null}</span>,
      <div key="qty" className="flex items-center justify-end gap-1">
        <div className="w-28 md:w-32"><OrderQuantity label={`Line ${index + 1} quantity`} value={line.qty} onChange={onQuantity && (value => onQuantity(index, value))} /></div>
        {model.lines.length > 1 ? <Button type="button" variant="ghost" size="sm" aria-label="Remove" title="Remove" onClick={() => onRemove?.(index)}>✕</Button> : null}
      </div>,
    ]), ["l", "l", "r"], { sortable: false })}
    <Button type="button" variant="ghost" className="w-fit" onClick={onAdd}>Add line</Button>
    {E.edit("Reason", reason, "text", undefined, { onChange: onReason, required: true })}
    {messages}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Save lines"}</Button>}
  </>;
}
