// lib/portal-cart.ts — pure decisions behind the portal cart's Save draft /
// Submit buttons (app/(portal)/portal/cart.tsx), kept out of the component so
// vitest can pin them down: which command syncs the cart to the database, and
// when the buttons are disabled.

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
export function cartActionsDisabled(s: { shipToId: string; lineCount: number; busy: boolean }) {
  return !s.shipToId || s.lineCount === 0 || s.busy;
}
