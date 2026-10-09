// lib/composer/state.ts — the record_movement proposal the Composer drawer
// renders, and the form link it hands off to. The schemas live here, not in
// lib/commands/inventory.ts, because the drawer is a client bundle and a
// lib/commands/<area>.ts import registers every command in the area
// (tests/boundary.test.ts). inventory.ts re-exports movementInput, so the
// command and the drawer validate one shape.
import { z } from "zod";

export const movementInput = z.object({
  lotId: z.string().uuid().optional(),
  skuId: z.string().uuid(), locationId: z.string().uuid(), binId: z.string().uuid(),
  qty: z.number().min(-9_999_999_999.99).max(9_999_999_999.99).refine(n => n !== 0, "qty cannot be 0"), // numeric(12,2)
  // Order-owned sale/transfer movements stay behind their atomic workflows.
  type: z.enum(["opening_balance", "production_in", "adjustment", "depletion", "return_in",
                "destruction", "loss", "sample", "festival_removal"]),
  saleChannelId: z.string().uuid().optional(),
  destState: z.string().length(2).optional(),
  note: z.string().optional(),
});
export type MovementInput = z.infer<typeof movementInput>;
export type MovementKind = MovementInput["type"];

/** One line of preview_inventory_movement's `effects`; the drawer reads only these keys. */
const composerEffect = z.object({
  label: z.string(),
  qty: z.string().optional(),
  bbl: z.string().optional(),
  stockBeforeQty: z.string().optional(),
  stockAfterQty: z.string().optional(),
  taxTreatment: z.string().nullable().optional(),
  correction: z.string().nullable().optional(),
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
