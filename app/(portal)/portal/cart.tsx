"use client";

import { Fragment, useEffect, useSyncExternalStore, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { ShopView } from "@/components/mgr/views/shop";
import { PortalBrandHeading } from "./brand-heading";
import { ReviewOrderView } from "@/components/mgr/views/review-order";
import { chosenOffer, effectiveRequestedDate, fillPallet, fitSuggestions, shipGroups, suggestionShipsFrom, toShopViewProps, type ShopRelease, type ShopSnapshot } from "@/lib/mgr/shop-view";
import { plural } from "@/lib/mgr/plural";
import { toQuotedReviewOrderViewProps, type PortalQuote } from "@/lib/mgr/review-order-view";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { command, CommandResponseError } from "@/lib/commands/client";
import { defaultShipToId } from "@/lib/order-form-rules";
import { money } from "@/lib/mgr/money";
import { cartActionsDisabled, cartLines, cartMissingInput, planDraftSync, portalAttemptKey, restorePortalAttempt, executePortalAttempt, clearWorkingCart, restoreWorkingCart, saveWorkingCart, type PortalAttempt, type PortalScope, type PortalFields } from "@/lib/portal-cart";
import { canRetireCommandFailure } from "@/lib/commands/failure";

/** A portal_catalog row: badge is the stock offer (null: not orderable from stock), releases the release offers;
 *  the package facts and pallet fit feed the summary's Pallet fit. */
export type CatalogItem = {
  skuId: string; name: string; product: string; brandAlias?: string | null; formatName?: string; unitPriceCents: number; badge: string | null; releases: ShopRelease[];
  packageType?: string | null; kegSize?: string | null; unitsPerCase?: number | null; palletFit?: number | null; palletFitMixed?: number | null; bblPerUnit?: number | null; packagingLb?: number | null; heightIn?: number | null;
};
export type ShipToOption = { id: string; label: string; country: string; is_default?: boolean };
export function submissionFailureMessage(message: string, draftId: string | null) {
  return draftId ? `Order saved, but submission could not be confirmed (${message}). View the order status before retrying, or contact the brewery.` : message;
}

type CartProps = {
  items: CatalogItem[];
  /** portal_brands: the buyer's brands, for each heading's label and reference sheet. */
  brands?: ShopSnapshot["brands"]; /** portal_schedule: planned batches, for the Pre-order page. */ planned?: ShopSnapshot["planned"]; /** "pre-order" draws the Pre-order page; absent draws Order. The cart is the same on both. */ section?: "pre-order";
  /** portal_release_share and portal_suggested_order: the buyer's limit and usual quantities, for the Pre-order page. */
  share?: ShopSnapshot["share"]; suggested?: ShopSnapshot["suggested"]; /** get_portal_account palletRules, for the pallet line and Fill the pallet. */ palletRules?: ShopSnapshot["palletRules"];
  /** The digest's "Review and submit" link: open with the suggested quantities filled in. */
  autoSuggest?: boolean; shipTos: ShipToOption[]; scope: PortalScope; fulfillmentSource: { id: string; name: string } | null;
  /** A saved draft or reorder (reconcilePortalOrder); releasesClosed names lines whose release closed since. */
  initial?: { fields: PortalFields; draftId: string | null; removed: string[]; releasesClosed?: string[] };
};
const subscribe = () => () => {};
export function Cart(props: CartProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <ReadyCart {...props} /> : E.info("Loading order recovery…");
}
/** One order of a split cart, quoted for Review. */
type QuotedOrder = { shipsFrom: string; requestedShipDate: string | null; lines: { skuId: string; qty: number; releaseId?: string }[]; quote: PortalQuote };

function ReadyCart({ items, shipTos, scope, initial, fulfillmentSource, brands, planned, section, share, suggested = [], palletRules, autoSuggest = false }: CartProps) {
  const router = useRouter();
  const [recovery] = useState(() => {
    try { return { attempt: restorePortalAttempt(sessionStorage.getItem(portalAttemptKey(scope)), scope), error: null }; }
    catch { return { attempt: null, error: "Order recovery could not be read. Check existing orders or contact the brewery before starting another order." }; }
  });
  // Only a new cart (not a draft, reorder or pending request) is kept in this
  // browser between visits (#710). ReadyCart renders only after hydration, so
  // reading localStorage here cannot mismatch the server render.
  const keepWorking = !initial && !recovery.attempt;
  const [working] = useState(() => keepWorking ? restoreWorkingCart(() => localStorage, scope, items, shipTos, Date.now()) : null);
  const initialFields = recovery.attempt?.fields ?? initial?.fields;
  const [fields, setFields] = useState<PortalFields>(initialFields ?? { shipToId: defaultShipToId(shipTos), poNumber: "", note: "", requestedShipDate: null, lines: [], ...working?.fields });
  /** The buyer's usual quantities for one ship date (absent: the soonest with any), for packages the cart does not hold yet, each on the release it was suggested for. */
  const suggestions = (held: Record<string, string>, shipsFrom?: string) => {
    const blank = items.map(item => ({ ...item, qty: 0 }));
    const dated = fitSuggestions(suggested, blank).map(s => ({ ...s, shipsFrom: suggestionShipsFrom(s, blank) ?? "" }));
    const date = shipsFrom ?? dated.map(s => s.shipsFrom).sort()[0];
    return dated.filter(s => s.shipsFrom === date && !(Number(held[s.skuId]) > 0));
  };
  // Opened from the digest, a new cart starts with the soonest ship date's suggested quantities filled in.
  const [opening] = useState(() => {
    const qty = working?.qty ?? Object.fromEntries((initialFields?.lines ?? []).map(l => [l.skuId, String(l.qty)]));
    const offers = working?.offers ?? Object.fromEntries((initialFields?.lines ?? []).map(l => [l.skuId, l.releaseId ?? ""]));
    const fill = autoSuggest && !initialFields ? suggestions(qty) : [];
    return { qty: { ...qty, ...Object.fromEntries(fill.map(s => [s.skuId, String(s.qty)])) }, offers: { ...offers, ...Object.fromEntries(fill.map(s => [s.skuId, s.releaseId])) } };
  });
  const [qty, setQty] = useState<Record<string, string>>(opening.qty);
  // The offer each line orders from: a release id, or "" for packaged stock.
  const [offers, setOffers] = useState<Record<string, string>>(opening.offers);
  const removed = initial?.removed ?? working?.removed ?? [];
  const untouched = useRef({ fields, qty, offers });
  useEffect(() => {
    // Save edits only: re-saving the restored cart would restart its 7-day clock on every visit.
    if (!keepWorking || (fields === untouched.current.fields && qty === untouched.current.qty && offers === untouched.current.offers)) return;
    saveWorkingCart(() => localStorage, scope, { fields, qty, offers }, items);
  }, [keepWorking, scope, fields, qty, offers, items]);
  const [draftId, setDraftId] = useState<string | null>(recovery.attempt && "orderId" in recovery.attempt.input ? recovery.attempt.input.orderId ?? null : initial?.draftId ?? null);
  const [attempt, setAttempt] = useState<PortalAttempt | null>(recovery.attempt);
  const ready = !recovery.error;
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [review, setReview] = useState(false);
  // One quote per order the cart becomes (shipGroups), in ship order.
  const [quotes, setQuotes] = useState<QuotedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(recovery.error);
  const catalog = items.map(item => ({ ...item, qty: Number(qty[item.skuId] ?? 0), offer: offers[item.skuId] }));
  // Each line names the release it orders from; a stock line names none.
  const lines = cartLines(qty)?.map(line => {
    const item = catalog.find(i => i.skuId === line.skuId);
    const releaseId = item ? chosenOffer(item) : "";
    return releaseId ? { ...line, releaseId } : line;
  });
  // A release line moves the requested date to its ships-from date at the earliest.
  const requestedShipDate = effectiveRequestedDate(fields.requestedShipDate ?? "", catalog) || null;
  const locked = !ready || busy || attempt !== null;
  const disabled = cartActionsDisabled({ hasSource: fulfillmentSource !== null, busy: locked, shipToId: fields.shipToId, lineCount: lines?.length ?? 0 });
  // Shown only when missing input is the whole reason; a missing source, a
  // pending request, or bad quantities already have their own messages.
  const missingInput = lines && fulfillmentSource && !attempt ? cartMissingInput({ shipToId: fields.shipToId, lineCount: lines.length }) : null;
  const unavailable = (lines ?? []).filter(l => !items.some(i => i.skuId === l.skuId));
  const subtotal = (lines ?? []).reduce((n, l) => n + (items.find(i => i.skuId === l.skuId)?.unitPriceCents ?? 0) * l.qty, 0);

  // The cart as the orders it becomes: stock ships now on the buyer's date, and
  // each pre-order ship date is its own order on that date, so no beer is held.
  const orders = shipGroups(catalog).map(group => ({
    shipsFrom: group.shipsFrom,
    requestedShipDate: group.shipsFrom || effectiveRequestedDate(fields.requestedShipDate ?? "", group.items) || null,
    lines: group.items.map(item => { const releaseId = chosenOffer(item); return { skuId: item.skuId, qty: item.qty, ...(releaseId ? { releaseId } : {}) }; }),
  }));

  /** Save draft keeps the whole cart as one draft. Submit places each quoted
   *  order in turn; one that fails leaves it and the orders after it in the
   *  cart. A pending request (`attempt`) is retried alone. While an order is
   *  being placed, the browser-saved cart holds only the orders after it, so
   *  a lost response or a reload never drops them and never keeps lines that
   *  may already be ordered. */
  async function run(purpose: "draft" | "submit") {
    if (inFlight.current || !ready) return;
    if (!attempt && disabled) return;
    if (!attempt && purpose === "submit" && !quotes) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    let active = attempt;
    // What is still unordered, as each placed order's lines leave the cart.
    let left = qty;
    let placed = 0;
    const queue: (QuotedOrder | null)[] = !attempt && purpose === "submit" ? quotes! : [null];
    try {
      let id = "";
      for (const [index, order] of queue.entries()) {
        if (!active) {
          const identity = { expectedIdentity: { actorId: scope.actorId, customerId: scope.customerId } };
          if (order) {
            // A draft being submitted becomes the first order; the others are new.
            active = { scope, purpose, fields: { ...fields, requestedShipDate: order.requestedShipDate, lines: order.lines }, command: "portal_submit_quote", requestId: crypto.randomUUID(), input: { quoteId: order.quote.quoteId, ...identity, ...(draftId && index === 0 ? { orderId: draftId } : {}) } };
          } else {
            const snapshot = { ...fields, requestedShipDate, lines: lines! };
            const plan = planDraftSync(draftId);
            active = { scope, purpose, fields: snapshot, command: plan.command, requestId: crypto.randomUUID(), input: { ...snapshot, ...identity, ...(plan.command === "portal_update_draft_order" ? { orderId: plan.orderId } : {}) } };
          }
        }
        // What is still unsent once this order is staged: the orders after it.
        const ordered = new Set(order?.lines.map(line => line.skuId));
        const rest = order ? Object.fromEntries(Object.entries(left).filter(([skuId]) => !ordered.has(skuId))) : {};
        // A draft being submitted still holds every line until its order is placed, so the rest is saved only after.
        const fromDraft = Boolean(order && draftId && index === 0);
        const keepRest = Object.keys(rest).length > 0 && !fromDraft;
        id = await executePortalAttempt(active, sessionStorage, command, next => {
          active = next; setAttempt(next);
          if ("orderId" in next.input) setDraftId(next.input.orderId ?? null);
          // Retire this request's lines from the browser-wide cart once it is staged, before it is
          // sent: the exact request lives only in this tab's sessionStorage, so lines left
          // behind would reopen elsewhere as unsent and invite a duplicate order. The
          // orders after it are unsent, so they stay. `!initial`, not `keepWorking`: a request
          // recovered after a reload came from a new cart too; a later order of a split cart has saved its rest.
          if (keepRest) saveWorkingCart(() => localStorage, scope, { fields, qty: rest, offers }, items);
          else if (!initial || index > 0) clearWorkingCart(() => localStorage, scope);
        });
        setAttempt(null); active = null; placed += 1;
        // The cart on screen is left alone until the run ends: changing it here would re-save lines already ordered.
        if (order) left = rest;
        if (fromDraft) {
          // The draft is now that order: the orders after it are new, and are an unsent cart until staged.
          setDraftId(null);
          if (Object.keys(rest).length) saveWorkingCart(() => localStorage, scope, { fields, qty: rest, offers }, items);
        }
      }
      router.push(placed > 1 ? "/portal/orders" : `/portal/orders/${id}`);
    } catch (err) {
      // Only a definitive first refusal can unlock edits; a later refusal
      // cannot disprove an earlier uncertain success.
      if (err instanceof CommandResponseError && canRetireCommandFailure(err.status, active?.requestId === attempt?.requestId, err.code)) {
        // A definitive refusal proves no order exists, so the unlocked cart is kept again.
        // After an order of a split cart was placed, what is left is a new cart even when it began as a draft.
        try { sessionStorage.removeItem(portalAttemptKey(scope)); setAttempt(null); if (keepWorking || placed) saveWorkingCart(() => localStorage, scope, { fields, qty: left, offers }, items); }
        catch { /* Keep the exact attempt if storage cannot retire it. */ }
        // The orders already placed leave the cart; the refused one and those after it stay to be fixed.
        if (placed) setQty(left);
      }
      const message = err instanceof Error ? err.message : "Order response could not be confirmed.";
      // The placed orders have left the cart, so their quotes no longer match it.
      if (placed) { setReview(false); setQuotes(null); }
      setError(placed ? `${plural(placed, "order")} placed; the rest of the cart was not. ${message}` : message);
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function openReview() {
    if (disabled || !lines) return;
    setBusy(true); setError(null);
    try {
      // One quote per order, each priced for its own lines and date.
      const next = await Promise.all(orders.map(async order => ({
        ...order, quote: await command(scope.breweryId, "portal_quote_order", { ...fields, requestedShipDate: order.requestedShipDate, lines: order.lines }, crypto.randomUUID(), scope) as PortalQuote,
      })));
      setQuotes(next); setReview(true);
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
    shipTos, shipToId: fields.shipToId,
    // A cart that splits has a date per order, so the summary shows only the date the buyer chose for what ships now.
    requestedDate: (orders.length > 1 ? fields.requestedShipDate : requestedShipDate) ?? "", poNumber: fields.poNumber, note: fields.note,
    source: { name: fulfillmentSource?.name ?? "Not configured" },
    catalog, brands, planned, share, suggested, palletRules,
  });
  shopModel.subtotal = unavailable.length ? "Unavailable for the pending request" : money(subtotal);
  return <>
    <ShopView model={shopModel} section={section}
      brandHeading={(group, { anchor, order }) => <PortalBrandHeading order={order} name={group.product} alias={group.alias} facts={group.facts} card thumbClass="aspect-[3/2] h-auto w-full [&>img]:object-cover" anchor={anchor} brand={group.brand} scope={scope} />} quantities={qty} locked={locked} disabled={disabled} preparing={busy}
      controls={{
        quantity: (id, value) => setQty(prev => ({ ...prev, [id]: value })),
        offer: (id, value) => setOffers(prev => ({ ...prev, [id]: value })),
        shipTo: shipToId => setFields(prev => ({ ...prev, shipToId })),
        requestedDate: value => setFields(prev => ({ ...prev, requestedShipDate: value || null })),
        po: poNumber => setFields(prev => ({ ...prev, poNumber })),
        note: note => setFields(prev => ({ ...prev, note })),
        saveDraft: () => { void run("draft"); }, review: () => { void openReview(); },
        suggest: shipsFrom => {
          const fill = suggestions(qty, shipsFrom);
          setQty(prev => ({ ...prev, ...Object.fromEntries(fill.map(s => [s.skuId, String(s.qty)])) }));
          setOffers(prev => ({ ...prev, ...Object.fromEntries(fill.map(s => [s.skuId, s.releaseId])) }));
        },
        fill: shipsFrom => setQty(prev => ({ ...prev, ...Object.fromEntries(Object.entries(fillPallet(catalog, shipsFrom, palletRules)).map(([id, n]) => [id, String(n)])) })),
      }}
      messages={<>
        {!fulfillmentSource && E.info("The brewery has not set where orders ship from. Contact the brewery before starting or submitting a new order. An existing uncertain request can still be retried.")}
        {removed.length ? E.info(`Removed unavailable or unpriced items: ${removed.join(", ")}. Review the remaining quantities.`, "alert") : null}
        {initial?.releasesClosed?.length ? E.info(`The release you chose has closed for ${initial.releasesClosed.join(", ")}. Check where each now orders from and the requested date.`, "alert") : null}
        {!lines && E.info("Enter whole quantities of zero or more.", "alert")}
        {missingInput && E.info(missingInput, "alert")}
        {unavailable.length > 0 && E.info(`Pending request contains packages no longer in the catalog: ${unavailable.map(line => `${line.skuId} × ${line.qty}`).join(", ")}. Retry retains the original quantities.`, "alert")}
        {feedback}
      </>} />
    <CommandForm open={review && quotes !== null} onOpenChange={open => { setReview(open); if (!open) setQuotes(null); }} title={quotes && quotes.length > 1 ? `Review ${quotes.length} orders` : "Review order"}>
      {quotes?.map((order, index) => {
        const several = quotes.length > 1;
        const last = index === quotes.length - 1;
        const shipment = shopModel.summary.shipments.find(s => s.key === (order.shipsFrom || "now"));
        const back = () => { setReview(false); setQuotes(null); };
        // Several orders are placed together, by one button under the last of them; undefined keeps the view's own buttons.
        let footer: ReactNode;
        if (several) footer = last ? <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={back}>Back to edit</Button>
          <Button type="button" disabled={disabled} onClick={() => { void run("submit"); }}>{busy ? "Placing orders…" : `Place ${quotes.length} orders`}</Button>
        </div> : null;
        return <Fragment key={order.shipsFrom}>
          {several ? E.group(shipment?.title ?? "Order") : null}
          <ReviewOrderView model={{ ...toQuotedReviewOrderViewProps(order.quote, { ...fields, requestedShipDate: order.requestedShipDate }, catalog), palletFit: shipment?.palletFit ?? shopModel.summary.palletFit }} locked={locked} disabled={disabled} submitting={busy}
            onQuantity={(id, value) => { setQty(prev => ({ ...prev, [id]: value })); back(); }}
            onBack={back} onPlace={() => { void run("submit"); }} messages={last ? feedback : undefined} footer={footer} />
        </Fragment>;
      })}
    </CommandForm>
  </>;
}
