// lib/commands/stock-line.ts — the one shape a stock move takes, whether it
// crosses locations (create_stock_transfer, transfers.ts) or stays inside one
// (move_stock_bin, inventory.ts): what moved, how much, out of which bin and
// into which. Stated once so the two commands cannot drift apart.
import { z } from "zod";

/** Exactly one of skuId / materialId / kegPoolId, and kegSize with kegPoolId:
 *  the table checks and the RPC say so, and raise when they disagree. */
export const stockLine = z.object({
  skuId: z.string().uuid().optional(), materialId: z.string().uuid().optional(),
  kegPoolId: z.string().uuid().optional(), kegSize: z.string().optional(),
  qty: z.number().positive(), fromBinId: z.string().uuid(), toBinId: z.string().uuid(), note: z.string().optional(),
}).refine(i => [i.skuId, i.materialId, i.kegPoolId].filter(Boolean).length === 1, "Choose exactly one stock kind")
  .refine(i => Boolean(i.kegPoolId) === Boolean(i.kegSize), "Keg size is required only for empty kegs")
  .refine(i => !i.kegPoolId || Number.isInteger(i.qty), "Empty kegs must be whole units");
