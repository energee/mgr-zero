// lib/commands/taproom.ts — keg pools and the keg event ledger (Program 7).
// A pool is a mutable row (name, kind, vendor, deposit); everything else is
// keg_events, an append-only count ledger where qty is always positive and
// `reason` is the direction. Balances are read at location × bin grain from
// keg_bin_totals ("36 in the taproom, 40 in storage" is two rows), the fleet
// total from keg_fleet_totals, and what a customer holds from
// keg_customer_balances plus keg_deposit_balances. Tap board writes
// (tap/kick/swap) and the weekly count are parked until Program 12.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, type Ctx } from "./registry";

export const KEG_SIZES = ["half_bbl", "quarter_bbl", "sixth_bbl", "fifty_l", "thirty_l", "twenty_l"] as const;
export const KEG_POOL_KINDS = ["owned", "leased", "pay_per_fill"] as const;
/** The reasons staff record by hand; transferred_in/out come from transfers and bin moves in pairs. */
export const KEG_EVENT_REASONS = ["acquired", "retired", "shipped", "returned", "lost", "found"] as const;

const ROLES: ("admin" | "warehouse")[] = ["admin", "warehouse"];
const cents = z.number().int().nonnegative();

defineCommand({
  name: "create_keg_pool", description: "Add a keg pool: owned, leased from a vendor, or pay-per-fill, with its per-keg deposit",
  input: z.object({
    name: z.string().trim().min(1), kind: z.enum(KEG_POOL_KINDS), vendorId: z.string().uuid().optional(),
    perFillCents: cents.optional(), depositCents: cents.optional(),
  }),
  roles: ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_keg_pool", {
    p_brewery: ctx.breweryId, p_name: i.name, p_kind: i.kind, p_vendor: i.vendorId ?? null,
    p_per_fill_cents: i.perFillCents ?? null, p_deposit_cents: i.depositCents ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "update_keg_pool", description: "Rename a keg pool, change its vendor, per-fill cost or deposit, or take it out of service; omitted fields keep their value",
  input: z.object({
    poolId: z.string().uuid(), name: z.string().trim().min(1).optional(), vendorId: z.string().uuid().optional(),
    perFillCents: cents.optional(), depositCents: cents.optional(), active: z.boolean().optional(),
  }),
  roles: ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("update_keg_pool", {
    p_brewery: ctx.breweryId, p_id: i.poolId, p_name: i.name ?? null, p_vendor: i.vendorId ?? null,
    p_per_fill_cents: i.perFillCents ?? null, p_deposit_cents: i.depositCents ?? null, p_active: i.active ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "record_keg_event",
  description: "Record kegs acquired, retired, shipped to or returned from a customer, lost or found, at a location and bin; shipped and returned need the customer",
  input: z.object({
    poolId: z.string().uuid(), kegSize: z.enum(KEG_SIZES), qty: z.number().int().positive(), reason: z.enum(KEG_EVENT_REASONS),
    locationId: z.string().uuid(), binId: z.string().uuid(), customerId: z.string().uuid().optional(),
    shipmentId: z.string().uuid().optional(), note: z.string().optional(),
  }),
  roles: ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_keg_event", {
    p_brewery: ctx.breweryId, p_pool: i.poolId, p_keg_size: i.kegSize, p_qty: i.qty, p_reason: i.reason,
    p_location: i.locationId, p_bin: i.binId, p_customer: i.customerId ?? null, p_shipment: i.shipmentId ?? null,
    p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

const listPools = (ctx: Ctx) => unwrap(ctx.db.from("keg_pools")
  .select("id, name, kind, vendor_id, per_fill_cents, deposit_cents, active").eq("brewery_id", ctx.breweryId).order("name"));

defineQuery({
  name: "list_keg_pools", description: "Keg pools, alphabetical, active and retired alike", input: z.object({}), roles: ROLES,
  handler: (ctx) => listPools(ctx),
});

// The Keg fleet page: every pool, and the on-hand count per pool × size ×
// location × bin. Zero rows are kept so a bin that emptied still shows.
defineQuery({
  name: "get_keg_fleet", description: "Keg pools with on-hand kegs per pool, size, location and bin", input: z.object({}), roles: ROLES,
  handler: async (ctx) => {
    const [pools, rows, locations, bins] = await Promise.all([
      listPools(ctx),
      unwrap(ctx.db.from("keg_bin_totals").select("pool_id, keg_size, location_id, bin_id, qty").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("locations").select("id, name").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("bins").select("id, name").eq("brewery_id", ctx.breweryId)),
    ]);
    const name = (list: { id: string; name: string }[] | null, id: string) => list?.find((x) => x.id === id)?.name ?? "";
    return {
      pools: pools ?? [],
      rows: (rows ?? []).map((r) => ({ ...r, qty: Number(r.qty), location_name: name(locations, r.location_id as string), bin_name: name(bins, r.bin_id as string) })),
    };
  },
});

defineQuery({
  name: "list_keg_events", description: "Keg event history, newest first, optionally for one pool or one customer",
  input: z.object({ poolId: z.string().uuid().optional(), customerId: z.string().uuid().optional() }), roles: ROLES,
  handler: (ctx, i) => {
    let q = ctx.db.from("keg_events")
      .select("id, pool_id, keg_size, qty, reason, location_id, bin_id, customer_id, shipment_id, at, note")
      .eq("brewery_id", ctx.breweryId).order("at", { ascending: false }).order("created_at", { ascending: false });
    if (i.poolId) q = q.eq("pool_id", i.poolId);
    if (i.customerId) q = q.eq("customer_id", i.customerId);
    return unwrap(q);
  },
});

// What one customer holds: net shipped − returned − lost per pool × size from
// the ledger, and the deposit dollars invoiced for those kegs from
// keg_deposit_balances (zero when no deposit line was ever invoiced).
defineQuery({
  name: "get_customer_keg_balance", description: "Kegs a customer has out per pool and size, with the deposit held for them",
  input: z.object({ customerId: z.string().uuid() }), roles: ROLES,
  handler: async (ctx, i) => {
    const [kegs, deposits, pools] = await Promise.all([
      unwrap(ctx.db.from("keg_customer_balances").select("pool_id, keg_size, qty").eq("brewery_id", ctx.breweryId).eq("customer_id", i.customerId)),
      unwrap(ctx.db.from("keg_deposit_balances").select("keg_pool_id, keg_size, deposit_cents").eq("brewery_id", ctx.breweryId).eq("customer_id", i.customerId)),
      listPools(ctx),
    ]);
    const rows = (kegs ?? []).map((k) => ({
      pool_id: k.pool_id as string,
      pool_name: pools?.find((p) => p.id === k.pool_id)?.name ?? "",
      keg_size: k.keg_size as string,
      kegs_out: Number(k.qty),
      deposit_cents: Number(deposits?.find((d) => d.keg_pool_id === k.pool_id && d.keg_size === k.keg_size)?.deposit_cents ?? 0),
    })).sort((a, b) => a.pool_name.localeCompare(b.pool_name) || a.keg_size.localeCompare(b.keg_size));
    return { rows, kegs_out: rows.reduce((n, r) => n + r.kegs_out, 0), deposit_cents: rows.reduce((n, r) => n + r.deposit_cents, 0) };
  },
});
