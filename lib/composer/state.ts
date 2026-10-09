// lib/composer/state.ts — the record_movement proposal the Composer drawer
// renders, and the form link it hands off to. The drawer parses every streamed
// proposal against composerProposal (lib/chat/messages.ts), so a malformed or
// non-movement proposal never reaches the commit button.
import { z } from "zod";
import { movementInput, type MovementInput } from "@/lib/commands/movement-input";

/** One line of preview_inventory_movement's `effects`; the drawer reads only
 *  these keys. The RPC builds them with jsonb_build_object, which writes a null
 *  operand as JSON null (bbl is null while a format has no bbl_per_unit), so
 *  every display figure is nullish; the view omits a missing one. */
const composerEffect = z.object({
  label: z.string(),
  qty: z.string().nullish(),
  bbl: z.string().nullish(),
  stockBeforeQty: z.string().nullish(),
  stockAfterQty: z.string().nullish(),
  taxTreatment: z.string().nullish(),
  correction: z.string().nullish(),
});
export type ComposerEffect = z.infer<typeof composerEffect>;

/** The agent may propose any AI-exposed command (lib/chat/agent.ts); the drawer
 *  renders and commits only this one, so anything else must fail the parse. */
export const composerProposal = z.object({
  name: z.literal("record_movement"),
  input: movementInput,
  previewToken: z.string().min(1),
  effects: z.array(composerEffect),
  warnings: z.array(z.string()),
});
export type ComposerProposal = z.infer<typeof composerProposal>;

export function movementFormHref(input: MovementInput, handoffId?: string) {
  const query = new URLSearchParams({
    recordMovement: "1", skuId: input.skuId, locationId: input.locationId,
    binId: input.binId, qty: String(input.qty), type: input.type,
  });
  if (input.lotId) query.set("lotId", input.lotId);
  if (input.saleChannelId) query.set("saleChannelId", input.saleChannelId);
  if (input.destState) query.set("destState", input.destState);
  if (input.note) query.set("note", input.note);
  if (handoffId) query.set("movementHandoff", handoffId);
  return `/inventory?${query}`;
}

export function movementFormInstanceKey(handoffId?: string) {
  return handoffId ? `composer:${handoffId}` : "manual";
}
