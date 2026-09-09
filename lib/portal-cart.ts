// lib/portal-cart.ts — pure decisions behind the portal cart's Save draft /
// Submit buttons (app/(portal)/portal/cart.tsx), kept out of the component so
// vitest can pin them down: which command syncs the cart to the database, and
// when the buttons are disabled.
import { canRetireCommandFailure } from "@/lib/commands/failure";

/** Which command writes the cart's current lines/fields to the database. A
 *  first save creates the draft; every later save replaces the saved draft's
 *  lines, so a quantity edited after Save draft (or after a submit that created
 *  the order but failed to confirm) is what actually gets submitted. */
export function planDraftSync(draftId: string | null) {
  return draftId
    ? ({ command: "portal_update_draft_order", orderId: draftId } as const)
    : ({ command: "portal_create_order" } as const);
}

/** Both buttons need a ship-to and at least one positive line and are locked
 *  while a call is in flight. An existing draft does not relax the line rule:
 *  syncing zero lines would be rejected by the database anyway. */
export function cartActionsDisabled(s: { shipToId: string; lineCount: number; busy: boolean; hasSource?: boolean }) {
  return !s.shipToId || s.lineCount === 0 || s.busy || s.hasSource === false;
}

import { z } from "zod";

const scopeSchema = z.object({ actorId: z.string().uuid(), customerId: z.string().uuid(), breweryId: z.string().uuid() }).strict();
const fieldsSchema = z.object({ shipToId: z.string().uuid(), poNumber: z.string(), note: z.string(), requestedShipDate: z.string().date().nullable(), lines: z.array(z.object({ skuId: z.string().uuid(), qty: z.number().int().positive() }).strict()).min(1) }).strict();
const identitySchema = z.object({ actorId: z.string().uuid(), customerId: z.string().uuid() }).strict();
const createInputSchema = fieldsSchema.extend({ expectedIdentity: identitySchema });
const submitInputSchema = z.object({ orderId: z.string().uuid(), expectedIdentity: identitySchema }).strict();
const attemptSchema = z.object({
  scope: scopeSchema, requestId: z.string().uuid(), purpose: z.enum(["draft", "submit"]), fields: fieldsSchema,
  command: z.enum(["portal_create_order", "portal_update_draft_order", "portal_submit_order"]),
  input: z.union([createInputSchema, createInputSchema.extend({ orderId: z.string().uuid() }), submitInputSchema]),
}).strict().superRefine((a, ctx) => {
  const expected = a.command === "portal_submit_order" ? submitInputSchema
    : a.command === "portal_create_order" ? createInputSchema : createInputSchema.extend({ orderId: z.string().uuid() });
  if (a.input.expectedIdentity.actorId !== a.scope.actorId || a.input.expectedIdentity.customerId !== a.scope.customerId) ctx.addIssue({ code: "custom", message: "Recovery identity changed" });
  if (!expected.safeParse(a.input).success || (a.command === "portal_submit_order" && a.purpose !== "submit")) ctx.addIssue({ code: "custom", message: "Invalid recovery stage" });
  if (a.command !== "portal_submit_order") {
    const fields = fieldsSchema.parse(Object.fromEntries(Object.entries(a.input).filter(([key]) => key !== "orderId" && key !== "expectedIdentity")));
    if (JSON.stringify(fields) !== JSON.stringify(a.fields)) ctx.addIssue({ code: "custom", message: "Recovery fields changed" });
  }
});
export type PortalScope = z.infer<typeof scopeSchema>;
export type PortalFields = z.infer<typeof fieldsSchema>;
export type PortalAttempt = z.infer<typeof attemptSchema>;
export const portalAttemptKey = (s: PortalScope) => `mgr-portal-attempt:${s.actorId}:${s.customerId}:${s.breweryId}`;
export function restorePortalAttempt(raw: string | null, scope: PortalScope): PortalAttempt | null {
  if (raw === null) return null;
  const attempt = attemptSchema.parse(JSON.parse(raw));
  if (JSON.stringify(attempt.scope) !== JSON.stringify(scope)) throw new Error("Recovery belongs to another account");
  return attempt;
}
export function storePortalAttempt(storage: Pick<Storage, "setItem">, attempt: PortalAttempt) {
  try { storage.setItem(portalAttemptKey(attempt.scope), JSON.stringify(attemptSchema.parse(attempt))); }
  catch { throw new Error("Could not save order recovery. Enable session storage and retry; no new request was sent."); }
}
export function cartLines(qty: Record<string, string>) {
  const lines = [];
  for (const [skuId, raw] of Object.entries(qty)) {
    if (!raw.trim()) continue;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) return null;
    if (value > 0) lines.push({ skuId, qty: value });
  }
  return lines;
}
export type PortalSavedOrder = {
  order: { id: string; status: string; ship_to_id: string | null; po_number: string | null; note: string | null; requested_ship_date: string | null };
  lines: { sku_id: string; qty_ordered: number; skus?: { name: string } | null }[];
};
export function reconcilePortalOrder(saved: PortalSavedOrder, items: { skuId: string }[], shipTos: { id: string }[], reorder: boolean) {
  if (!reorder && saved.order.status !== "draft") throw new Error("Only draft orders can be edited. View the order status.");
  const available = new Set(items.map(i => i.skuId));
  return {
    draftId: reorder ? null : saved.order.id,
    removed: saved.lines.filter(l => !available.has(l.sku_id)).map(l => l.skus?.name ?? l.sku_id),
    fields: {
      shipToId: shipTos.some(s => s.id === saved.order.ship_to_id) ? saved.order.ship_to_id! : "",
      poNumber: reorder ? "" : saved.order.po_number ?? "", note: reorder ? "" : saved.order.note ?? "",
      requestedShipDate: reorder ? null : saved.order.requested_ship_date,
      lines: saved.lines.filter(l => available.has(l.sku_id)).map(l => ({ skuId: l.sku_id, qty: Number(l.qty_ordered) })),
    },
  };
}

/** Explicit retry only. Each stage is durable before transport; a lost submit
 * response therefore retries submit, never updates a possibly submitted order. */
export async function executePortalAttempt(
  attempt: PortalAttempt,
  storage: Pick<Storage, "setItem" | "removeItem">,
  send: (breweryId: string, name: string, input: unknown, requestId: string, expectedContext?: PortalScope) => Promise<unknown>,
  onStage: (attempt: PortalAttempt) => void,
): Promise<string> {
  storePortalAttempt(storage, attempt);
  onStage(attempt);
  const result = await send(attempt.scope.breweryId, attempt.command, attempt.input, attempt.requestId, attempt.scope) as { order_id?: string };
  const id = "orderId" in attempt.input ? attempt.input.orderId : result?.order_id;
  if (!id || !z.string().uuid().safeParse(id).success) throw new Error("Order response could not be confirmed. Retry the same request.");
  if (attempt.purpose === "submit" && attempt.command !== "portal_submit_order") {
    return executePortalAttempt({ ...attempt, command: "portal_submit_order", input: { orderId: id, expectedIdentity: attempt.input.expectedIdentity }, requestId: crypto.randomUUID() }, storage, send, onStage);
  }
  storage.removeItem(portalAttemptKey(attempt.scope));
  return id;
}

// A later refusal cannot establish whether an earlier uncertain send committed.
export function canRetirePortalFailure(status: number, retrying: boolean) {
  return canRetireCommandFailure(status, retrying);
}
