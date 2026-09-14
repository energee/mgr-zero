"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/mgr/date-picker";
import { OrderQuantity } from "./new-order";
import type { ReceivePoViewModel } from "@/lib/mgr/receive-po-view";

export type { ReceivePoViewModel };
export type ReceivePoControls = {
  quantity?: (id: string, value: string) => void; lot?: (id: string, value: string) => void;
  bestBy?: (id: string, value: string) => void; location?: (id: string) => void;
  bin?: (id: string) => void; receivedOn?: (value: string) => void; sentVia?: (value: string) => void;
};

export function ReceivePoView({ model, controls = {}, messages, submitting = false, disabled = false, footer }: {
  model: ReceivePoViewModel; controls?: ReceivePoControls; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; disabled?: boolean;
}) {
  const state = model.state ?? "sent";
  const receiving = state === "sent" || state === "partially_received";
  return <>
    {E.back("Purchase orders", model.title, undefined, model.backHref)}
    {model.status && E.fld("Status", model.status)}
    {model.note && E.fld("Note", model.note)}
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {receiving && model.locations && <>
        <div className="grid grid-cols-2 gap-2">
          {E.pick("Received into", String(model.locationId ?? ""), [{ value: "", label: "Select location" }, ...(model.locations.map(location => ({ value: location.id, label: location.name })))], { onChange: controls.location, required: true })}
          {E.pick("Bin", String(model.binId ?? ""), [{ value: "", label: "Select bin" }, ...(model.bins?.map(bin => ({ value: bin.id, label: bin.name })) ?? [])], { onChange: controls.bin, required: true })}
        </div>
        <DatePicker label="Received on" value={controls.receivedOn ? model.receivedOn ?? "" : undefined} defaultValue={model.receivedOn} onChange={controls.receivedOn} />
      </>}
      {(model.lines ?? []).map(line => <Fragment key={line.key}>
        {receiving ? E.line(line.title, line.detail,
          <OrderQuantity label={`${line.title} counted`} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(line.key, value))} />,
          line.warning ? "w" : line.ok ? "ok" : "",
          line.lot !== undefined ? <>
            {E.edit("Lot", line.lot, "text", line.lotOptions, { onChange: controls.lot ? value => controls.lot?.(line.key, value) : undefined, placeholder: "Lot code off the package", "aria-label": `${line.title} lot` })}
            <DatePicker label="Best by" value={controls.bestBy ? line.bestBy ?? "" : undefined} defaultValue={line.bestBy} onChange={controls.bestBy && (value => controls.bestBy?.(line.key, value))} />
            {line.note && E.note(line.note)}
          </> : null,
        ) : E.row(line.title, line.detail, String(line.qty))}
      </Fragment>)}
      {state === "draft" && <>
        {E.pick("How it went out", String((controls.sentVia ? model.sentVia : model.sentVia ?? "mailto") ?? ""), [{ value: "mailto", label: "From my mail client" }, { value: "external", label: "Phoned, faxed, or vendor portal" }], { onChange: controls.sentVia })}
        {E.info("MGR records that you sent it today; nothing is emailed from here.")}
      </>}
    </fieldset>
    {receiving && <>
      {model.lotSuggestionsUnavailable && E.gated("Recent lots", "Recent lot suggestions are not returned by the purchase-order query. Read the lot code from the package.")}
      {E.tape(model.tape ?? [])}
      {model.info && E.info(model.info)}
    </>}
    {model.history?.length ? <>{E.ttl("Receipts")}{model.history.map(receipt => <Fragment key={receipt.key}>{E.nav(receipt.label, receipt.detail, "", undefined, receipt.href)}</Fragment>)}</> : null}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : (receiving || state === "draft") && <Button type="submit" data-variant={receiving ? "irreversible" : undefined} className={receiving ? "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" : ""} disabled={submitting || disabled}>{submitting ? "Saving…" : state === "draft" ? "Mark sent" : "Receive purchase order"}</Button>}
  </>;
}
