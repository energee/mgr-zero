"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
          <Field><FieldLabel>Received into</FieldLabel><select aria-label="Received into" required className="min-w-0 rounded border bg-background p-2" value={controls.location ? model.locationId : undefined} defaultValue={controls.location ? undefined : model.locationId} onChange={event => controls.location?.(event.target.value)}>
            <option value="">Select location</option>{model.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select></Field>
          <Field><FieldLabel>Bin</FieldLabel><select aria-label="Bin" required className="min-w-0 rounded border bg-background p-2" value={controls.bin ? model.binId : undefined} defaultValue={controls.bin ? undefined : model.binId} onChange={event => controls.bin?.(event.target.value)}>
            <option value="">Select bin</option>{model.bins?.map(bin => <option key={bin.id} value={bin.id}>{bin.name}</option>)}
          </select></Field>
        </div>
        <DatePicker label="Received on" value={controls.receivedOn ? model.receivedOn ?? "" : undefined} defaultValue={model.receivedOn} onChange={controls.receivedOn} />
      </>}
      {(model.lines ?? []).map(line => <Fragment key={line.key}>
        {receiving ? E.line(line.title, line.detail,
          <OrderQuantity label={`${line.title} counted`} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(line.key, value))} />,
          line.warning ? "w" : line.ok ? "ok" : "",
          line.lot !== undefined ? <>
            <Field><FieldLabel>Lot</FieldLabel><Input aria-label={`${line.title} lot`} list={line.lotOptions?.length ? `receipt-lot-${line.key}` : undefined} placeholder="Lot code off the package" value={controls.lot ? line.lot : undefined} defaultValue={controls.lot ? undefined : line.lot} onChange={event => controls.lot?.(line.key, event.target.value)} />
              {line.lotOptions?.length ? <datalist id={`receipt-lot-${line.key}`}>{line.lotOptions.map(lot => <option key={lot} value={lot} />)}</datalist> : null}
            </Field>
            <DatePicker label="Best by" value={controls.bestBy ? line.bestBy ?? "" : undefined} defaultValue={line.bestBy} onChange={controls.bestBy && (value => controls.bestBy?.(line.key, value))} />
            {line.note && E.note(line.note)}
          </> : null,
        ) : E.row(line.title, line.detail, String(line.qty))}
      </Fragment>)}
      {state === "draft" && <>
        <Field><FieldLabel>How it went out</FieldLabel><select aria-label="How it went out" className="rounded border bg-background p-2" value={controls.sentVia ? model.sentVia : undefined} defaultValue={controls.sentVia ? undefined : model.sentVia ?? "mailto"} onChange={event => controls.sentVia?.(event.target.value)}>
          <option value="mailto">From my mail client</option><option value="external">Phoned, faxed, or vendor portal</option>
        </select></Field>
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
