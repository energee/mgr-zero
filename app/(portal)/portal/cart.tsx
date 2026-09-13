"use client";

import { useSyncExternalStore, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { ShopView } from "@/components/mgr/views/shop";
import { ReviewOrderView } from "@/components/mgr/views/review-order";
import { toShopViewProps } from "@/lib/mgr/shop-view";
import { toQuotedReviewOrderViewProps, type PortalQuote } from "@/lib/mgr/review-order-view";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { command, CommandResponseError } from "@/lib/commands/client";
import { defaultShipToId } from "@/lib/order-form-rules";
import { cartActionsDisabled, cartLines, planDraftSync, portalAttemptKey, restorePortalAttempt, executePortalAttempt, type PortalAttempt, type PortalScope, type PortalFields } from "@/lib/portal-cart";
import { canRetireCommandFailure } from "@/lib/commands/failure";

export type CatalogItem = { skuId: string; name: string; product: string; unitPriceCents: number };
export type ShipToOption = { id: string; label: string; is_default?: boolean };
export function submissionFailureMessage(message: string, draftId: string | null) {
  return draftId ? `Order saved, but submission could not be confirmed (${message}). View the order status before retrying, or contact the brewery.` : message;
}

type CartProps = {
  customerName: string;
  items: CatalogItem[]; shipTos: ShipToOption[]; scope: PortalScope; fulfillmentSource: { id: string; name: string } | null;
  initial?: { fields: PortalFields; draftId: string | null; removed: string[] };
};
const subscribe = () => () => {};
export function Cart(props: CartProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <ReadyCart {...props} /> : E.info("Loading order recovery…");
}
function ReadyCart({ customerName, items, shipTos, scope, initial, fulfillmentSource }: CartProps) {
  const router = useRouter();
  const [recovery] = useState(() => {
    try { return { attempt: restorePortalAttempt(sessionStorage.getItem(portalAttemptKey(scope)), scope), error: null }; }
    catch { return { attempt: null, error: "Order recovery could not be read. Check existing orders or contact the brewery before starting another order." }; }
  });
  const initialFields = recovery.attempt?.fields ?? initial?.fields;
  const [fields, setFields] = useState<PortalFields>(initialFields ?? { shipToId: defaultShipToId(shipTos), poNumber: "", note: "", requestedShipDate: null, lines: [] });
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries((initialFields?.lines ?? []).map(l => [l.skuId, String(l.qty)])));
  const [draftId, setDraftId] = useState<string | null>(recovery.attempt && "orderId" in recovery.attempt.input ? recovery.attempt.input.orderId ?? null : initial?.draftId ?? null);
  const [attempt, setAttempt] = useState<PortalAttempt | null>(recovery.attempt);
  const ready = !recovery.error;
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [review, setReview] = useState(false);
  const [quote, setQuote] = useState<PortalQuote | null>(null);
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
        if (purpose === "submit") {
          if (!quote) return;
          active = { scope, purpose, fields: snapshot, command: "portal_submit_quote", requestId: crypto.randomUUID(), input: { quoteId: quote.quoteId, expectedIdentity: { actorId: scope.actorId, customerId: scope.customerId }, ...(draftId ? { orderId: draftId } : {}) } };
        } else {
          const plan = planDraftSync(draftId);
          active = { scope, purpose, fields: snapshot, command: plan.command, requestId: crypto.randomUUID(), input: { ...snapshot, expectedIdentity: { actorId: scope.actorId, customerId: scope.customerId }, ...(plan.command === "portal_update_draft_order" ? { orderId: plan.orderId } : {}) } };
        }
      }
      const id = await executePortalAttempt(active, sessionStorage, command, next => {
        active = next; setAttempt(next);
        if ("orderId" in next.input) setDraftId(next.input.orderId ?? null);
      });
      setAttempt(null);
      router.push(`/portal/orders/${id}`);
    } catch (err) {
      // Only a definitive first refusal can unlock edits; a later refusal
      // cannot disprove an earlier uncertain success.
      if (err instanceof CommandResponseError && canRetireCommandFailure(err.status, active?.requestId === attempt?.requestId, err.code)) {
        try { sessionStorage.removeItem(portalAttemptKey(scope)); setAttempt(null); }
        catch { /* Keep the exact attempt if storage cannot retire it. */ }
      }
      setError(err instanceof Error ? err.message : "Order response could not be confirmed.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function openReview() {
    if (disabled || !lines) return;
    setBusy(true); setError(null);
    try {
      const next = await command(scope.breweryId, "portal_quote_order", { ...fields, lines }, crypto.randomUUID(), scope) as PortalQuote;
      setQuote(next); setReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order review is unavailable.");
    } finally { setBusy(false); }
  }
  const feedback = <>
    <CommandFormMessage error={error} />
    {attempt && E.info("An order request needs confirmation. Fields are locked; Retry reuses that exact request without creating another order.")}
    {draftId && <Link className="underline" href={`/portal/orders/${draftId}`}>View order status</Link>}
    {attempt && <Button type="button" disabled={busy} onClick={() => run(attempt.purpose)}>Retry order request</Button>}
  </>;
  const shopModel = toShopViewProps({
    customer: { id: scope.customerId, name: customerName }, shipTos, shipToId: fields.shipToId,
    requestedDate: fields.requestedShipDate ?? "", poNumber: fields.poNumber, note: fields.note,
    source: { name: fulfillmentSource?.name ?? "Not configured" },
    catalog: items.map(item => ({ ...item, qty: Number(qty[item.skuId] ?? 0) })),
  });
  shopModel.subtotal = unavailable.length ? "Unavailable for the pending request" : `$${(subtotal / 100).toFixed(2)}`;
  return <>
    <ShopView model={shopModel} quantities={qty} locked={locked} disabled={disabled} preparing={busy}
      controls={{
        quantity: (id, value) => setQty(prev => ({ ...prev, [id]: value })),
        shipTo: shipToId => setFields(prev => ({ ...prev, shipToId })),
        requestedDate: value => setFields(prev => ({ ...prev, requestedShipDate: value || null })),
        po: poNumber => setFields(prev => ({ ...prev, poNumber })),
        note: note => setFields(prev => ({ ...prev, note })),
        saveDraft: () => { void run("draft"); }, review: () => { void openReview(); },
      }}
      messages={<>
        {!fulfillmentSource && E.info("The brewery has not set where orders ship from. Contact the brewery before starting or submitting a new order. An existing uncertain request can still be retried.")}
        {initial?.removed.length ? E.info(`Removed unavailable or unpriced items: ${initial.removed.join(", ")}. Review the remaining quantities.`) : null}
        {!lines && E.info("Enter whole quantities of zero or more.")}
        {unavailable.length > 0 && E.info(`Pending request contains packages no longer in the catalog: ${unavailable.map(line => `${line.skuId} × ${line.qty}`).join(", ")}. Retry retains the original quantities.`)}
        {feedback}
      </>} />
    <CommandForm open={review && quote !== null} onOpenChange={open => { setReview(open); if (!open) setQuote(null); }} title="Review order">
      {quote && <ReviewOrderView model={toQuotedReviewOrderViewProps(quote, fields)} locked={locked} disabled={disabled} submitting={busy}
        onQuantity={(id, value) => { setQty(prev => ({ ...prev, [id]: value })); setReview(false); setQuote(null); }}
        onBack={() => { setReview(false); setQuote(null); }}
        onPlace={() => { void run("submit"); }} messages={feedback} />}
    </CommandForm>
  </>;
}
