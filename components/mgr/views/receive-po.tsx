"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { DatePicker } from "@/components/mgr/date-picker";
import { OrderQuantity } from "./new-order";
import { CLOSURE_FORM_ID, receiveMode, receiveReason, type ReceivePoViewModel } from "@/lib/mgr/receive-po-view";
import { submitReason } from "@/lib/mgr/submit-reason";

export type ReceivePoControls = {
  quantity?: (id: string, value: string) => void; lot?: (id: string, value: string) => void;
  cost?: (id: string, value: string) => void;
  bestBy?: (id: string, value: string) => void; location?: (id: string) => void;
  reason?: (value: string) => void; closureReason?: (value: string) => void;
  bin?: (id: string) => void; receivedOn?: (value: string) => void; sentVia?: (value: string) => void;
};

/** Receive purchase order and Correct receipt print why they are withheld
 *  (receiveReason), beside their own button rather than the closure block's.
 *  A draft offers Mark sent and Edit draft (`model.editHref`, Edit PO). */
export function ReceivePoView({ model, controls = {}, messages, submitting = false, footer }: {
  model: ReceivePoViewModel; controls?: ReceivePoControls; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean;
}) {
  const mode = receiveMode(model.state);
  const correcting = mode === "correct";
  const receiving = mode === "receive" || correcting;
  let verb: ReactNode = null;
  if (receiving) verb = E.pin(<IrreversibleSubmit label={correcting ? "Correct receipt" : "Receive purchase order"} submitting={submitting} reason={receiveReason(model)} />);
  else if (mode === "draft") verb = E.pin(E.submit("Mark sent", { submitting }));
  return <>
    {E.back("Purchase orders", model.title, undefined, model.backHref)}
    {model.status && E.fld("Status", model.status)}
    {model.note && E.fld("Note", model.note)}
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {correcting && E.edit("Correction reason", model.correctionReason ?? "", "text", undefined, { onChange: controls.reason, required: true })}
      {receiving && model.locations && <>
        <div className="grid grid-cols-2 gap-2">
          {E.pick("Received into", String(model.locationId ?? ""), [{ value: "", label: "Select location", disabled: true }, ...(model.locations.map(location => ({ value: location.id, label: location.name })))], { onChange: controls.location, required: true })}
          {E.pick("Bin", String(model.binId ?? ""), [{ value: "", label: "Select bin", disabled: true }, ...(model.bins?.map(bin => ({ value: bin.id, label: bin.name })) ?? [])], { onChange: controls.bin, required: true })}
        </div>
        {correcting ? E.fld("Received on", model.receivedOn ?? "—") : <DatePicker label="Received on" value={controls.receivedOn ? model.receivedOn ?? "" : undefined} defaultValue={model.receivedOn} onChange={controls.receivedOn} />}
      </>}
      {(model.lines ?? []).map(line => <Fragment key={line.key}>
        {receiving ? E.line(line.title, line.detail,
          <OrderQuantity label={`${line.title} counted`} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(line.key, value))} />,
          line.warning ? "w" : line.ok ? "ok" : "",
          <>
            {E.edit("Unit cost ($)", line.cost ?? "", "number", undefined, {
              onChange: controls.cost ? value => controls.cost?.(line.key, value) : undefined,
              min: 0, step: "0.01", placeholder: "Optional", "aria-label": `${line.title} unit cost`,
            })}
            {line.lot !== undefined && <>
              {E.edit("Lot", line.lot, "text", line.lotOptions, { onChange: controls.lot ? value => controls.lot?.(line.key, value) : undefined, placeholder: "Lot code off the package", "aria-label": `${line.title} lot` })}
              <DatePicker label="Best by" value={controls.bestBy ? line.bestBy ?? "" : undefined} defaultValue={line.bestBy} onChange={controls.bestBy && (value => controls.bestBy?.(line.key, value))} />
              {line.note && E.note(line.note)}
            </>}
          </>,
        ) : E.row(line.title, line.detail, String(line.qty))}
      </Fragment>)}
      {mode === "draft" && <>
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
    {mode === "draft" && E.btn("Edit draft", "g", model.editHref ?? "#")}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : verb}
    {/* The rare closure folds behind its title, after the order's next verb (#1584).
        Its fields belong to the sibling closure form (CLOSURE_FORM_ID), not the receive form around this view. */}
    {model.closure && <details>
      <summary className="cursor-pointer text-sm font-medium">{model.closure === "cancel" ? "Cancel purchase order" : "Close remaining quantity"}</summary>
      <fieldset disabled={submitting} className="mt-3 flex flex-col gap-3">
        {E.edit("Closure reason", model.closureReason ?? "", "text", undefined, { onChange: controls.closureReason, form: CLOSURE_FORM_ID })}
        {E.info("Only the unreceived remainder is released. Posted receipts and stock stay in history.")}
        {E.pin(E.submit(model.closure === "cancel" ? "Cancel purchase order" : "Close short", { form: CLOSURE_FORM_ID, variant: "destructive", disabled: submitting, reason: submitReason(model.closureReason?.trim() ? [] : ["a closure reason"]) }))}
      </fieldset>
    </details>}
  </>;
}
