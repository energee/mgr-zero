"use client";

import { useSyncExternalStore, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { command, CommandResponseError } from "@/lib/commands/client";
import { defaultShipToId } from "@/lib/order-form-rules";
import { cartActionsDisabled, canRetirePortalFailure, cartLines, planDraftSync, portalAttemptKey, restorePortalAttempt, executePortalAttempt, type PortalAttempt, type PortalScope, type PortalFields } from "@/lib/portal-cart";

export type CatalogItem = { skuId: string; name: string; product: string; unitPriceCents: number };
export type ShipToOption = { id: string; label: string; is_default?: boolean };
export function submissionFailureMessage(message: string, draftId: string | null) {
  return draftId ? `Order saved, but submission could not be confirmed (${message}). View the order status before retrying, or contact the brewery.` : message;
}

type CartProps = {
  items: CatalogItem[]; shipTos: ShipToOption[]; scope: PortalScope; fulfillmentSource: { id: string; name: string } | null;
  initial?: { fields: PortalFields; draftId: string | null; removed: string[] };
};
const subscribe = () => () => {};
export function Cart(props: CartProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <ReadyCart {...props} /> : E.info("Loading order recovery…");
}
function ReadyCart({ items, shipTos, scope, initial, fulfillmentSource }: CartProps) {
  const router = useRouter();
  const [recovery] = useState(() => {
    try { return { attempt: restorePortalAttempt(sessionStorage.getItem(portalAttemptKey(scope)), scope), error: null }; }
    catch { return { attempt: null, error: "Order recovery could not be read. Check existing orders or contact the brewery before starting another order." }; }
  });
  const initialFields = recovery.attempt?.fields ?? initial?.fields;
  const [fields, setFields] = useState<PortalFields>(initialFields ?? { shipToId: defaultShipToId(shipTos), poNumber: "", note: "", requestedShipDate: null, lines: [] });
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries((initialFields?.lines ?? []).map(l => [l.skuId, String(l.qty)])));
  const [draftId, setDraftId] = useState(recovery.attempt && "orderId" in recovery.attempt.input ? recovery.attempt.input.orderId : initial?.draftId ?? null);
  const [attempt, setAttempt] = useState<PortalAttempt | null>(recovery.attempt);
  const ready = !recovery.error;
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(recovery.error);
  const lines = cartLines(qty);
  const locked = !ready || busy || attempt !== null;
  const disabled = cartActionsDisabled({ hasSource: fulfillmentSource !== null, busy: locked, shipToId: fields.shipToId, lineCount: lines?.length ?? 0 });
  const unavailable = (lines ?? []).filter(l => !items.some(i => i.skuId === l.skuId));
  const subtotal = (lines ?? []).reduce((n, l) => n + (items.find(i => i.skuId === l.skuId)?.unitPriceCents ?? 0) * l.qty, 0);

  async function run(purpose: "draft" | "submit") {
    if (inFlight.current || !ready) return;
    if (!attempt && disabled) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    let active = attempt;
    try {
      if (!active) {
        const snapshot = { ...fields, lines: lines! };
        const plan = planDraftSync(draftId);
        active = { scope, purpose, fields: snapshot, command: plan.command, requestId: crypto.randomUUID(), input: { ...snapshot, expectedIdentity: { actorId: scope.actorId, customerId: scope.customerId }, ...(plan.command === "portal_update_draft_order" ? { orderId: plan.orderId } : {}) } };
      }
      const id = await executePortalAttempt(active, sessionStorage, command, next => {
        active = next; setAttempt(next);
        if ("orderId" in next.input) setDraftId(next.input.orderId);
      });
      setAttempt(null);
      router.push(`/portal/orders/${id}`);
    } catch (err) {
      // Only a definitive first refusal can unlock edits; a later refusal
      // cannot disprove an earlier uncertain success.
      if (err instanceof CommandResponseError && canRetirePortalFailure(err.status, active?.requestId === attempt?.requestId)) {
        try { sessionStorage.removeItem(portalAttemptKey(scope)); setAttempt(null); }
        catch { /* Keep the exact attempt if storage cannot retire it. */ }
      }
      setError(err instanceof Error ? err.message : "Order response could not be confirmed.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  const feedback = <>
    <CommandFormMessage error={error} />
    {attempt && E.info("An order request needs confirmation. Fields are locked; Retry reuses that exact request without creating another order.")}
    {draftId && <Link className="underline" href={`/portal/orders/${draftId}`}>View order status</Link>}
    {attempt && <Button type="button" disabled={busy} onClick={() => run(attempt.purpose)}>Retry order request</Button>}
  </>;
  return <div className="flex flex-col gap-4">
    {E.fld("Ships from", fulfillmentSource?.name ?? "Not configured")}
    {!fulfillmentSource && E.info("The brewery has not set where orders ship from. Contact the brewery before starting or submitting a new order. An existing uncertain request can still be retried.")}
    {!items.length && E.blank("Nothing is listed for wholesale yet. Call the brewery.")}
    {initial?.removed.length ? E.info(`Removed unavailable or unpriced items: ${initial.removed.join(", ")}. Review the remaining quantities.`) : null}
    <fieldset disabled={locked} className="flex flex-col gap-3">
      {items.map(i => <div key={i.skuId}>
        {E.row(i.product, i.name, `$${(i.unitPriceCents / 100).toFixed(2)}`)}
        <Label htmlFor={`qty-${i.skuId}`}>Quantity — {i.product} · {i.name}</Label>
        <Input id={`qty-${i.skuId}`} type="number" min={0} step={1} value={qty[i.skuId] ?? ""} onChange={e => setQty({ ...qty, [i.skuId]: e.target.value })} className="w-24" />
      </div>)}
      {!lines && E.info("Enter whole quantities of zero or more.")}
      <Label htmlFor="ship-to">Ship to</Label>
      <select id="ship-to" className="rounded-md border p-2" value={fields.shipToId} onChange={e => setFields({ ...fields, shipToId: e.target.value })}>
        <option value="">Select a ship-to</option>{shipTos.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <Label htmlFor="requested-date">Requested date (optional)</Label>
      <Input id="requested-date" type="date" value={fields.requestedShipDate ?? ""} onChange={e => setFields({ ...fields, requestedShipDate: e.target.value || null })} />
      <Label htmlFor="po-number">PO number</Label><Input id="po-number" value={fields.poNumber} onChange={e => setFields({ ...fields, poNumber: e.target.value })} />
      <Label htmlFor="note">Note</Label><Input id="note" value={fields.note} onChange={e => setFields({ ...fields, note: e.target.value })} />
    </fieldset>
    {E.fld("Current catalog subtotal", unavailable.length ? "Unavailable for the pending request" : `$${(subtotal / 100).toFixed(2)}`)}
    {E.info("Taxes and keg deposits are not included. The brewery confirms final invoice amounts and the requested delivery date.")}
    {unavailable.length > 0 && E.info(`Pending request contains packages no longer in the catalog: ${unavailable.map(l => `${l.skuId} × ${l.qty}`).join(", ")}. Retry retains the original quantities.`)}
    {feedback}
    <div className="flex gap-2"><Button variant="outline" disabled={disabled} onClick={() => run("draft")}>Save draft</Button><Button disabled={disabled} onClick={() => setReview(true)}>Review order</Button></div>
    <CommandForm open={review} onOpenChange={setReview} title="Review order">
      {E.fld("Ships from", fulfillmentSource?.name ?? "Not configured")}
      {E.fld("Ship to", shipTos.find(s => s.id === fields.shipToId)?.label ?? "Select a ship-to")}
      {E.fld("Requested date", fields.requestedShipDate ?? "Not specified")}
      {fields.poNumber && E.fld("PO number", fields.poNumber)}{fields.note && E.fld("Note", fields.note)}
      {(lines ?? []).map(l => <div key={l.skuId}>{E.row(items.find(i => i.skuId === l.skuId)?.name ?? "Item", `Quantity ${l.qty}`, `$${((items.find(i => i.skuId === l.skuId)?.unitPriceCents ?? 0) * l.qty / 100).toFixed(2)}`)}</div>)}
      {E.fld("Current catalog subtotal", unavailable.length ? "Unavailable for the pending request" : `$${(subtotal / 100).toFixed(2)}`)}
      {E.info("Taxes and keg deposits are pending; this is not a final invoice total.")}
      {feedback}
      <div className="flex gap-2 py-3"><Button variant="outline" disabled={busy} onClick={() => setReview(false)}>Back to edit</Button><Button disabled={disabled} onClick={() => run("submit")}>Submit order</Button></div>
    </CommandForm>
  </div>;
}
