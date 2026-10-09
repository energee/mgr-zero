// lib/commands/movement-input.ts — the input schema of the record_movement
// command. It registers no command, so the Composer drawer (a client bundle)
// can validate a proposal against it without pulling in the inventory
// commands (tests/boundary.test.ts). inventory.ts and preview.ts use it too.
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
