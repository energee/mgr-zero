"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity } from "./new-order";
import type { PickViewModel } from "@/lib/mgr/pick-view";

export type { PickViewModel };

export function PickView({ model, footer, quantities, onQuantity, onShort, onPrint, messages, submitting = false }: {
  model: PickViewModel; footer?: ReactNode; quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void; onShort?: (key: string) => void;
  onPrint?: () => void; messages?: ReactNode; submitting?: boolean;
}) {
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {E.info(model.info)}
    {model.lines.map(line => <div key={line.key}>
      {E.row(line.name, line.detail,
        <OrderQuantity label={`${line.name} quantity`} value={quantities?.[line.key] ?? line.qty} max={line.ordered} onChange={onQuantity && (value => onQuantity(line.key, value))} />,
        line.tone ?? "")}
      {line.tone === "w" && quantities?.[line.key] !== "" && <Button type="button" size="sm" variant="outline" onClick={() => onShort?.(line.key)}>Short</Button>}
    </div>)}
    <Button type="button" variant="ghost" onClick={onPrint}>Print pick sheet</Button>
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Done picking"}</Button>}
  </>;
}
