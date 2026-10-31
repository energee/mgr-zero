// components/mgr/views/lot-trace.tsx — Lot trace. Live slots recipient and
// movement extras; inventory draws the tape and empty recipients.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { rowLinkPrefetch } from "@/lib/mgr/row-link-prefetch";
import type { LotTraceRecipientView, LotTraceViewModel } from "@/lib/mgr/lot-trace-view";

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
      {E.back(model.backTo ?? "Compliance", model.title, undefined, model.backHref)}
      {E.row(model.sku, model.skuDetail, model.skuTrailing)}
      {E.fld("Tank · batch", model.tankBatch)}
      {E.fld("Drawn", model.drawn)}
      {E.ttl("Ingredients")}
      {model.ingredients.length ? model.ingredients.map(row => <Fragment key={row.key}>{row.tracked ? E.nav(row.title, row.detail, "", undefined, row.href) : E.fld(row.title, row.detail ?? "")}</Fragment>) : E.blank("No recorded ingredient lots")}
      {E.ttl("Member batches")}
      {model.memberBatches.map(row => <Fragment key={row.key}>{E.nav(row.title, row.detail, "", undefined, row.href)}</Fragment>)}
      {model.sourceTransfers.length > 0 && <>
        {E.ttl("Recorded source transfers")}
        {model.sourceTransfers.map(row => <Fragment key={row.key}>{E.fld(row.title, [row.detail, row.trailing].filter(Boolean).join(" · "))}</Fragment>)}
      </>}
      {tape !== undefined ? tape : E.tape(model.tape.map((row) => [row.label, <span key={row.key} className="whitespace-nowrap">{row.when}</span>]))}
      {E.ttl("Recorded balances by SKU and bin")}
      {balances !== undefined ? balances : model.balances.length ? model.balances.map((row) => (
        <Fragment key={row.key}>{E.row(row.title, row.detail ?? "", row.trailing ?? "")}</Fragment>
      )) : E.blank("No recorded balance of this lot")}
      {E.ttl("Recipients")}
      {recipients !== undefined ? recipients : <LotRecipients recipients={model.recipients ?? []} empty={model.recipientsEmpty} />}
      {movements !== undefined ? movements : (tape === null && model.movements?.length ? <>
        {E.ttl("Movements")}
        {model.movements.map((movement) => <div key={movement.id} id={`movement-${movement.id}`} className="border-b py-3">
          {E.row(movement.title, movement.detail, movement.trailing)}
          {movement.sourceHref && <Link className="underline" href={movement.sourceHref}>Source movement</Link>}
          {movement.reference && <p>{movement.referenceHref ? <Link className="underline" href={movement.referenceHref} prefetch={rowLinkPrefetch(movement.referenceHref)}>{movement.reference}</Link> : movement.reference}</p>}
        </div>)}
      </> : null)}
      {E.info(model.note)}
    </>
  );
}


/** A live value links to its record; an inventory value (no href) is plain text. */
const linked = (text: string, href?: string) => href ? <Link href={href} prefetch={rowLinkPrefetch(href)} className="underline">{text}</Link> : text;

/** Shared recorded recipients, one labeled field per fact; trace screens do not draw a second shipment/customer block. */
export function LotRecipients({ recipients, empty }: { recipients: LotTraceRecipientView[]; empty?: string }) {
  return recipients.length ? recipients.map(recipient => <div key={recipient.id} className="border-b py-3">
    {E.fld("Order", linked(recipient.orderNo, recipient.orderHref))}
    {recipient.customer && E.fld("Customer", linked(recipient.customer.name, recipient.customer.href))}
    {recipient.shipTo && E.fld("Ship to", recipient.shipTo)}
    {recipient.shipments.map(shipment => <Fragment key={shipment.id}>
      {E.fld("Shipment", shipment.label)}
      {shipment.invoices.map(invoice => <Fragment key={invoice.id}>{E.fld("Invoice", linked(invoice.number, invoice.href))}</Fragment>)}
    </Fragment>)}
  </div>) : empty ? E.blank(empty) : null;
}
