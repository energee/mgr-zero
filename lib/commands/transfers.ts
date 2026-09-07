// lib/commands/transfers.ts — stock transfers: an internal move of finished
// goods, materials or empty kegs between two locations (spec 2026-09-06
// Decision 3). Never a priced document. Every write is one RPC through the
// command-request claim; a move inside one location is move_stock_bin
// (inventory.ts), and create_stock_transfer refuses same-location pairs.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const roles = ["admin", "warehouse"] as const;
const readRoles = ["admin", "sales", "warehouse"] as const;

const line = z.object({
  skuId: z.string().uuid().optional(), materialId: z.string().uuid().optional(),
  kegPoolId: z.string().uuid().optional(), kegSize: z.string().optional(),
  qty: z.number().positive(), fromBinId: z.string().uuid(), toBinId: z.string().uuid(), note: z.string().optional(),
}).refine((l) => [l.skuId, l.materialId, l.kegPoolId].filter(Boolean).length === 1, "exactly one of skuId, materialId, kegPoolId")
  .refine((l) => (l.kegPoolId === undefined) === (l.kegSize === undefined), "kegSize goes with kegPoolId");

defineCommand({
  name: "create_stock_transfer", description: "Draft a stock transfer between two locations: sku, material or keg-pool lines, each with a from-bin and a to-bin",
  roles: [...roles],
  input: z.object({
    fromLocationId: z.string().uuid(), toLocationId: z.string().uuid(),
    requestedDate: z.string().date().optional(), note: z.string().optional(), lines: z.array(line).min(1),
  }),
  handler: async (ctx, i, execution) => {
    const r = await unwrap(ctx.db.rpc("create_stock_transfer", {
      p_brewery: ctx.breweryId, p_from: i.fromLocationId, p_to: i.toLocationId,
      p_requested: i.requestedDate ?? null, p_note: i.note ?? null,
      p_lines: i.lines.map((l) => ({
        sku_id: l.skuId ?? null, material_id: l.materialId ?? null, keg_pool_id: l.kegPoolId ?? null, keg_size: l.kegSize ?? null,
        qty: l.qty, from_bin_id: l.fromBinId, to_bin_id: l.toBinId, note: l.note ?? null,
      })),
      p_request_id: execution.requestId,
    })) as { transfer_id: string };
    return { transferId: r.transfer_id };
  },
});

defineCommand({
  name: "submit_stock_transfer", description: "Submit a draft stock transfer",
  roles: [...roles],
  input: z.object({ transferId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("submit_stock_transfer", { p_transfer: i.transferId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "record_stock_transfer_pick", description: "Record picked quantities per transfer line; the transfer becomes picked",
  roles: [...roles],
  input: z.object({ transferId: z.string().uuid(), picks: z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })).min(1) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_stock_transfer_pick", {
    p_transfer: i.transferId, p_picks: i.picks.map((p) => ({ line_id: p.lineId, qty: p.qty })), p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "receive_stock_transfer", description: "Receive a picked transfer: paired volume-neutral ledger rows per line (FG, material or kegs) in one transaction; the transfer becomes received",
  roles: [...roles], requiresConfirmation: true,
  input: z.object({ transferId: z.string().uuid(), lines: z.array(z.object({ lineId: z.string().uuid(), qty: z.number().nonnegative() })) }),
  handler: async (ctx, i, execution) => {
    const r = await unwrap(ctx.db.rpc("receive_stock_transfer", {
      p_transfer: i.transferId, p_lines: i.lines.map((l) => ({ line_id: l.lineId, qty: l.qty })), p_request_id: execution.requestId,
    })) as { transfer_id: string };
    return { transferId: r.transfer_id };
  },
});

defineQuery({
  name: "list_stock_transfers", description: "Stock transfers, newest first, with their lines",
  roles: [...readRoles],
  input: z.object({ status: z.enum(["draft", "submitted", "picked", "in_transit", "received", "cancelled"]).optional() }),
  handler: (ctx, i) => {
    let q = ctx.db.from("stock_transfers").select("*, stock_transfer_lines(*)").eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false });
    if (i.status) q = q.eq("status", i.status);
    return unwrap(q);
  },
});
