"use client";

// components/mgr/views/short-pick.tsx — the Short pick sheet body: one short
// line's count, a required reason and the order adjustment preview.
// The sheet (CommandForm) carries the title, so the body draws no back link.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity } from "./new-order";
import type { ShortPickViewModel } from "@/lib/mgr/short-pick-view";

export function ShortPickView({ model, footer, reason, reasonValue = "", onReason, countedValue, onCounted, messages, submitting = false, disabled = false }: {
  model: ShortPickViewModel; footer?: ReactNode; reason?: ReactNode;
  reasonValue?: string; onReason?: (value: string) => void;
  countedValue?: string; onCounted?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean;
}) {
  return <>
    {E.fld("Order · source", model.source)}
    {E.row(model.lineName, model.orderedLabel, <OrderQuantity label="Counted" value={countedValue ?? model.counted} onChange={onCounted} />, "w")}
    {reason !== undefined ? reason : E.edit("Reason · required", reasonValue, "text", undefined, { onChange: onReason, required: true, "aria-label": "Reason" })}
    {E.ttl(model.resolveTitle)}
    {E.info(<>Preview: order line {model.ordered} {E.arrow()} {model.counted}. Customer sees “adjusted”. The missing quantity is cancelled, not backordered. For a zero count, ask Sales or Admin to remove the line or cancel the order.</>)}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : model.verb}</Button>}
  </>;
}
