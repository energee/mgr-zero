// components/mgr/views/lot-trace.tsx — Lot trace. Live slots recipient and
// movement extras; inventory draws the tape and empty recipients.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import type { LotTraceViewModel } from "@/lib/mgr/lot-trace-view";

export type { LotTraceViewModel };

export function LotTraceView({
  model,
  tape,
  balances,
  recipients,
  movements,
}: {
  model: LotTraceViewModel;
  tape?: ReactNode;
  balances?: ReactNode;
  recipients?: ReactNode;
  movements?: ReactNode;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Compliance months", model.title, undefined, model.backHref)}
      {E.row(model.sku, model.skuDetail, model.skuTrailing)}
      {E.fld("Tank · batch", model.tankBatch)}
      {E.fld("Drawn", model.drawn)}
      {tape !== undefined ? tape : E.tape(model.tape.map((row) => [row.label, row.when]))}
      {E.ttl("Recorded balances by SKU and bin")}
      {balances !== undefined ? balances : model.balances.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail ?? "", row.trailing ?? "")}</Fragment>
      ))}
      {E.ttl("Recipients")}
      {recipients !== undefined ? recipients : (model.recipients?.length ? model.recipients.map((recipient) => (
        <div key={recipient.id} className="flex flex-col gap-2 border-b py-3">
          {recipient.orderHref ? <Link href={recipient.orderHref} className="underline">Order {recipient.orderNo}</Link> : <p>Order {recipient.orderNo}</p>}
          {recipient.customer && (recipient.customer.href ? <Link href={recipient.customer.href} className="underline">{recipient.customer.name}</Link> : <p>{recipient.customer.name}</p>)}
          {recipient.shipTo && <p>{recipient.shipTo}</p>}
          {recipient.shipments.map((shipment) => <div key={shipment.id}><p>{shipment.label}</p>{shipment.invoices.map((invoice) => invoice.href ? <Link key={invoice.id} href={invoice.href} className="underline">Invoice {invoice.number}</Link> : <p key={invoice.id}>Invoice {invoice.number}</p>)}</div>)}
        </div>
      )) : (model.recipientsEmpty ? E.blank(model.recipientsEmpty) : null))}
      {movements !== undefined ? movements : (tape === null && model.movements?.length ? <>
        {E.ttl("Movements")}
        {model.movements.map((movement) => <div key={movement.id} id={`movement-${movement.id}`} className="border-b py-3">
          {E.row(movement.title, movement.detail, movement.trailing)}
          {movement.sourceMovementId && (movement.sourceHref ? <Link className="underline" href={movement.sourceHref}>Source movement {movement.sourceMovementId}</Link> : <p>Source movement {movement.sourceMovementId}</p>)}
          {movement.reference && <p>{movement.creditMemo ? (movement.referenceHref ? <Link className="underline" href={movement.referenceHref}>Credit memo {movement.reference}</Link> : `Credit memo ${movement.reference}`) : `Reference ${movement.reference}`}</p>}
        </div>)}
      </> : null)}
      {E.note(model.note)}
    </>
  );
}
