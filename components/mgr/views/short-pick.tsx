"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrderQuantity } from "./new-order";
import type { ShortPickViewModel } from "@/lib/mgr/short-pick-view";

export type { ShortPickViewModel };

export function ShortPickView({ model, footer, reason, reasonValue = "", onReason, resolution = 0, onResolution, countedValue, onCounted, messages, submitting = false, disabled = false }: {
  model: ShortPickViewModel; footer?: ReactNode; reason?: ReactNode;
  reasonValue?: string; onReason?: (value: string) => void;
  resolution?: number; onResolution?: (value: number) => void;
  countedValue?: string; onCounted?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean;
}) {
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.fld("Order · source", model.source)}
    {E.row(model.lineName, model.orderedLabel, <OrderQuantity label="Counted" value={countedValue ?? model.counted} onChange={onCounted} />, "w")}
    {reason !== undefined ? reason : <Field><FieldLabel>Reason · required</FieldLabel><Input aria-label="Reason" required value={onReason ? reasonValue : undefined} defaultValue={onReason ? undefined : reasonValue} onChange={event => onReason?.(event.target.value)} /></Field>}
    {E.ttl(model.resolveTitle)}
    <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start"
      value={onResolution ? String(resolution) : undefined} defaultValue={onResolution ? undefined : String(resolution)}
      onValueChange={value => { if (value !== "") onResolution?.(Number(value)); }}>
      {model.chips.map((chip, index) => <ToggleGroupItem key={index} value={String(index)}>{chip}</ToggleGroupItem>)}
    </ToggleGroup>
    {resolution === 0
      ? E.info(<>Preview: order line {model.ordered} {E.arrow()} {model.counted}. Customer sees “adjusted”.</>)
      : E.info(<>Preview: {model.counted} staged · {model.missing} remain owed · the order keeps its Pick action.</>)}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : resolution === 0 ? model.verb : model.chips[1] ?? model.verb}</Button>}
  </>;
}
