"use client";

// components/mgr/views/pick.tsx — the Pick sheet: one table row per SKU,
// Format · Product · Ordered · Actual. The format is named on its first row
// only; Actual is the count field, and a count below ordered shows Short.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity } from "./new-order";
import { startsGroup } from "@/lib/mgr/brand-lines";
import type { PickViewModel } from "@/lib/mgr/pick-view";

export type { PickViewModel };

export function PickView({ model, footer, quantities, onQuantity, onShort, onPrint, messages, submitting = false, disabled = false }: {
  model: PickViewModel; footer?: ReactNode; quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void; onShort?: (key: string) => void;
  onPrint?: () => void; messages?: ReactNode; submitting?: boolean;
  /** A validation/restore gate disables saving without claiming an in-flight command. */
  disabled?: boolean;
}) {
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.polite(model.subtitle)}
    {E.tbl(["Format", "Product", "Ordered", "Actual"], model.lines.map((line, i) => [
      startsGroup(model.lines, i) ? E.brand(line.group) : "",
      line.name,
      line.ordered,
      // Short stacks under the count on a phone so the column stays narrow; it sits left of the count from md up.
      <div key="actual" className="flex flex-col items-end gap-1 md:flex-row-reverse md:items-center md:gap-2">
        <div className="w-32"><OrderQuantity label={`${line.group ? `${line.group} ` : ""}${line.name} quantity`} value={quantities?.[line.key] ?? line.qty} max={line.ordered} onChange={onQuantity && (value => onQuantity(line.key, value))} /></div>
        {line.tone === "w" && quantities?.[line.key] !== "" && <Button type="button" size="sm" variant="outline" onClick={() => onShort?.(line.key)}>Short</Button>}
      </div>,
    ]), ["l", "l", "r", "r"], { sortable: false })}
    <Button type="button" variant="ghost" onClick={onPrint}>Print pick sheet</Button>
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : "Done picking"}</Button>}
  </>;
}
