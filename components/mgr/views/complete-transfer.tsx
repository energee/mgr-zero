// components/mgr/views/complete-transfer.tsx — Complete transfer drawing.
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity } from "./new-order";
import type { CompleteTransferViewModel } from "@/lib/mgr/complete-transfer-view";

export type { CompleteTransferViewModel };

export function CompleteTransferView({
  model,
  sources,
  footer,
  tape,
  quantities,
  onQuantity,
  messages,
  submitting = false,
  disabled = false,
}: {
  sources?: ReactNode;
  model: CompleteTransferViewModel;
  footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][];
  quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean;
}) {
  return (
    <>
      {E.back(model.backTo, "Complete transfer", undefined, model.backHref)}
      {E.fld(<>From {E.arrow(null)} to</>, <>{model.fromLabel} {E.arrow()} {model.toLabel}</>)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, `move / picked · ${line.detail}`, <OrderQuantity label={`${line.name} transfer quantity`} value={quantities?.[line.key] ?? line.qty} max={line.picked} step="0.01" required onChange={onQuantity && (value => onQuantity(line.key, value))} />, line.tone ?? "")}</Fragment>
      ))}
      {E.tape(tape ?? model.tape)}
      {E.info("No invoice: this is an internal move.")}
      {sources}
      {messages}
      {E.sp()}
      {footer !== undefined ? footer : <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Completing…" : "Complete transfer"}</Button>}
    </>
  );
}
