// lib/commands/taproom.ts — keg pools and the keg event ledger (Program 7).
// A pool is a mutable row (name, kind, vendor, deposit); everything else is
// keg_events, an append-only count ledger where qty is always positive and
// `reason` is the direction. What a bin physically holds is keg_bin_on_hand
// ("36 in the taproom, 40 in storage" is two rows; shipped kegs have left),
// the fleet total is keg_fleet_totals (shipped kegs are still the fleet),
// and what a customer holds is keg_customer_balances plus
// keg_deposit_balances. Tap board writes
// and durable physical counts are implemented below.
import { z } from "zod";
import { CommandError, defineCommand, defineQuery, unwrap, type Ctx } from "./registry";

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
  description: "Record kegs acquired, retired, shipped to or returned from a customer, lost or found, at a location and bin; shipped and returned need the customer, found never has one, and retired, shipped or lost cannot exceed what the bin holds",
  input: z.object({
    poolId: z.string().uuid(), kegSize: z.enum(KEG_SIZES), qty: z.number().int().positive(), reason: z.enum(KEG_EVENT_REASONS),
    locationId: z.string().uuid(), binId: z.string().uuid(), customerId: z.string().uuid().optional(), note: z.string().optional(),
  }),
  roles: ROLES,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_keg_event", {
    p_brewery: ctx.breweryId, p_pool: i.poolId, p_keg_size: i.kegSize, p_qty: i.qty, p_reason: i.reason,
    p_location: i.locationId, p_bin: i.binId, p_customer: i.customerId ?? null, p_note: i.note ?? null,
    p_request_id: execution.requestId,
  })),
});

const listPools = (ctx: Ctx) => unwrap(ctx.db.from("keg_pools")
  .select("id, name, kind, vendor_id, per_fill_cents, deposit_cents, active").eq("brewery_id", ctx.breweryId).order("name"));

defineQuery({
  name: "list_keg_pools", description: "Keg pools, alphabetical, active and retired alike", input: z.object({}), roles: ROLES,
  handler: (ctx) => listPools(ctx),
});

// The Keg fleet page: every pool, what each bin physically holds per pool ×
// size, and the customers holding kegs. Zero rows are kept so a bin that
// emptied still shows; a customer with nothing out is not listed.
defineQuery({
  name: "get_keg_fleet", description: "Keg pools, kegs on hand per pool, size, location and bin, and customers with kegs out", input: z.object({}), roles: ROLES,
  handler: async (ctx) => {
    const [pools, rows, locations, bins, out, customers] = await Promise.all([
      listPools(ctx),
      unwrap(ctx.db.from("keg_bin_on_hand").select("pool_id, keg_size, location_id, bin_id, qty").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("locations").select("id, name").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("bins").select("id, name").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("keg_customer_balances").select("customer_id, qty").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("customers").select("id, name").eq("brewery_id", ctx.breweryId)),
    ]);
    const name = (list: { id: string; name: string }[] | null, id: string) => list?.find((x) => x.id === id)?.name ?? "";
    const kegsOut = new Map<string, number>();
    for (const o of out ?? []) kegsOut.set(o.customer_id as string, (kegsOut.get(o.customer_id as string) ?? 0) + Number(o.qty));
    return {
      pools: pools ?? [],
      rows: (rows ?? []).map((r) => ({ ...r, qty: Number(r.qty), location_name: name(locations, r.location_id as string), bin_name: name(bins, r.bin_id as string) })),
      customers: [...kegsOut].filter(([, n]) => n !== 0).map(([customer_id, kegs_out]) => ({ customer_id, name: name(customers, customer_id), kegs_out }))
        .sort((a, b) => a.name.localeCompare(b.name)),
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
    const rows = (kegs ?? []).filter((k) => Number(k.qty) !== 0).map((k) => ({
      pool_id: k.pool_id as string,
      pool_name: pools?.find((p) => p.id === k.pool_id)?.name ?? "",
      keg_size: k.keg_size as string,
      kegs_out: Number(k.qty),
      deposit_cents: Number(deposits?.find((d) => d.keg_pool_id === k.pool_id && d.keg_size === k.keg_size)?.deposit_cents ?? 0),
    })).sort((a, b) => a.pool_name.localeCompare(b.pool_name) || a.keg_size.localeCompare(b.keg_size));
    return { rows, kegs_out: rows.reduce((n, r) => n + r.kegs_out, 0), deposit_cents: rows.reduce((n, r) => n + r.deposit_cents, 0) };
  },
});

const COUNT_ROLES = ["admin", "warehouse", "taproom"] as const;
defineQuery({
  name: "get_taproom_count_snapshot", description: "Prepare today's complete taproom count by bin, SKU and explicit lot UUID or null; includes zero buckets, safe brand/package-volume labels, prior count and revision, without POS or lot-label access",
  input: z.object({ locationId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_taproom_count_snapshot", { p_brewery: ctx.breweryId, p_location: i.locationId })),
});
defineQuery({
  name: "get_taproom_count", description: "Read a saved taproom count with every physical observation, safe bin and SKU labels, prior count, movement identity and frozen depletion BBL",
  input: z.object({ countId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_taproom_count", { p_brewery: ctx.breweryId, p_count: i.countId })),
});
defineQuery({
  name: "list_taproom_counts", description: "Newest 50 durable physical-count headers at one owned taproom, with observation, movement and depleted-unit totals",
  input: z.object({ locationId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: async (ctx, i) => {
    const location = await unwrap(ctx.db.from("locations").select("kind").eq("brewery_id", ctx.breweryId).eq("id", i.locationId).maybeSingle()) as { kind: string } | null;
    if (location?.kind !== "taproom") throw new CommandError("choose an owned taproom location");
    const counts = await unwrap(ctx.db.from("taproom_counts")
      .select("id,location_id,counted_on,counted_by,created_at,prior_count_id")
      .eq("brewery_id", ctx.breweryId).eq("location_id", i.locationId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50)) as unknown as {
        id: string; location_id: string; counted_on: string; counted_by: string; created_at: string; prior_count_id: string | null;
      }[];
    const lines: { count_id: string; qty_before: number; qty_counted: number; movement_id: string | null }[] = [];
    for (let start = 0; counts.length > 0; start += 500) {
      const page = await unwrap(ctx.db.from("taproom_count_lines").select("count_id,qty_before,qty_counted,movement_id", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).in("count_id", counts.map((count) => count.id)).order("count_id").order("id").range(start, start + 499)) as unknown as typeof lines;
      lines.push(...page);
      if (page.length < 500) break;
    }
    return counts.map((count) => {
      const observed = lines.filter((line) => line.count_id === count.id);
      return ({ ...count,
        observations: observed.length,
        movements: observed.filter((line) => line.movement_id !== null).length,
        depleted_units: observed.reduce((total, line) => total + Number(line.qty_before) - Number(line.qty_counted), 0),
      });
    });
  },
});
defineCommand({
  name: "record_taproom_count", description: "Save today's complete explicit-bucket count of remaining whole packaged units using the prepared revision; partial kegs count as one until gone. Persist matching counts without movements; shortages alone post exact-lot depletion. Stale, incomplete, duplicate and overcounts are refused; count correction is not yet available",
  input: z.object({ locationId: z.string().uuid(), countedOn: z.string().date(), revision: z.string().min(1),
    lines: z.array(z.object({ binId: z.string().uuid(), skuId: z.string().uuid(), lotId: z.string().uuid().nullable(), qtyCounted: z.number().int().nonnegative() })) }),
  roles: [...COUNT_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_taproom_count", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_counted_on: i.countedOn, p_revision: i.revision,
    p_lines: i.lines.map(l => ({ bin_id: l.binId, sku_id: l.skuId, lot_id: l.lotId, qty_counted: l.qtyCounted })), p_request_id: execution.requestId,
  })),
});

const openingFill = z.union([z.literal(.25), z.literal(.5), z.literal(.6), z.literal(1)]);
const closingFill = z.union([z.literal(0), z.literal(.25), z.literal(.5)]);
const kegIdentity = z.union([
  z.object({ skuId: z.string().uuid(), label: z.never().optional(), nominalBbl: z.never().optional() }),
  z.object({ skuId: z.never().optional(), label: z.string().trim().min(1).max(200), nominalBbl: z.number().positive().finite() }),
]);
const tapNumber = z.string().trim().min(1).max(80).optional();
defineCommand({
  name: "tap_keg", description: "Open a keg interval at an owned taproom. keg is {skuId} for an own packaged keg or {label, nominalBbl} for a guest; freezes size and flags absent stock. Optional tap numbers may repeat. Does not change inventory",
  input: z.object({ locationId: z.string().uuid(), keg: kegIdentity, tapNumber, openingFill }), roles: [...COUNT_ROLES],
  handler: (ctx,i,e) => unwrap(ctx.db.rpc("tap_keg", { p_brewery: ctx.breweryId, p_location: i.locationId, p_sku: i.keg.skuId ?? null,
    p_label: i.keg.label ?? null, p_nominal_bbl: i.keg.nominalBbl ?? null, p_tap_number: i.tapNumber ?? null, p_opening_fill: i.openingFill, p_request_id: e.requestId })),
});
defineCommand({
  name: "kick_keg", description: "Close an open keg interval with estimated remaining fill (empty, quarter or half) and a reason. An already-closed conflict returns its safe closer label and timestamp. Does not change inventory",
  input: z.object({ openIntervalId: z.string().uuid(), closeFill: closingFill, reason: z.string().trim().min(1).max(200) }), roles: [...COUNT_ROLES],
  handler: (ctx,i,e) => unwrap(ctx.db.rpc("kick_keg", { p_brewery: ctx.breweryId, p_interval: i.openIntervalId, p_closing_fill: i.closeFill, p_reason: i.reason, p_request_id: e.requestId })),
});
defineCommand({
  name: "swap_keg", description: "Atomically close the outgoing interval and open its replacement at the same location. incomingKeg is {skuId} or {label, nominalBbl}; omission defaults to the outgoing own SKU, while guests require explicit identity. Exact retries return the original pair; an already-closed conflict returns its safe closer label and timestamp. Does not change inventory",
  input: z.object({ openIntervalId: z.string().uuid(), incomingKeg: kegIdentity.optional(), tapNumber, incomingOpeningFill: openingFill,
    closeFill: closingFill, reason: z.string().trim().min(1).max(200) }), roles: [...COUNT_ROLES],
  handler: (ctx,i,e) => unwrap(ctx.db.rpc("swap_keg", { p_brewery: ctx.breweryId, p_interval: i.openIntervalId, p_closing_fill: i.closeFill, p_reason: i.reason,
    p_sku: i.incomingKeg?.skuId ?? null, p_label: i.incomingKeg?.label ?? null, p_nominal_bbl: i.incomingKeg?.nominalBbl ?? null,
    p_tap_number: i.tapNumber ?? null, p_opening_fill: i.incomingOpeningFill, p_request_id: e.requestId })),
});
defineQuery({
  name: "list_open_taps", description: "All open intervals at one taproom, numbered first; frozen size, fill, safe SKU and brand labels, stock flag and opening actor ID/handle/time. No POS yield or remaining-volume estimate",
  input: z.object({ locationId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: (ctx,i) => unwrap(ctx.db.rpc("list_open_taps", { p_brewery: ctx.breweryId, p_location: i.locationId })),
});
defineQuery({
  name: "list_tap_history", description: "The latest 50 closed intervals at one taproom with opening and closing actor IDs, safe handles, times, frozen nominal size, fill and reason",
  input: z.object({ locationId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: (ctx,i) => unwrap(ctx.db.rpc("list_tap_history", { p_brewery: ctx.breweryId, p_location: i.locationId })),
});


defineQuery({
  name: "get_taproom_variance", description: "Current brand comparison over completed count pairs ending in the last 4 or 12 brewery-local calendar weeks. Whole periods use (prior created_at, current created_at]; first counts lack a baseline. Actual is frozen count depletion, expected is frozen POS serving volume. Missing coverage stays null; explicitly complete empty observations permit zero. Mapped lines contribute despite mapping gaps. Timestamp-active equal-share tap estimates retain excluded out-of-stock shares; guest identity is never inferred. Late reconciled sales may change expected, never inventory. Returns bounds, as_of, coverage, mapping gaps and unattributed volume",
  input: z.object({ locationId: z.string().uuid(), weeks: z.union([z.literal(4), z.literal(12)]) }), roles: [...COUNT_ROLES],
  handler: (ctx,i) => unwrap(ctx.db.rpc("get_taproom_variance", { p_brewery: ctx.breweryId, p_location: i.locationId, p_weeks: i.weeks })),
});
defineQuery({
  name: "get_taproom_draft_projection", description: "Expected consumption since the latest saved taproom count through the server as-of, grouped by brand for a draft recount. Returns the prior count identity and exact bounds, nullable expected BBL, coverage source bounds and completeness, mapping gaps, ignored lines, excluded shares and unattributed volume. Complete empty observation may mean zero; no baseline or usable observation stays null. Late reconciled sales may change this read, which never posts inventory or allocates physical lots",
  input: z.object({ locationId: z.string().uuid() }), roles: [...COUNT_ROLES],
  handler: (ctx,i) => unwrap(ctx.db.rpc("get_taproom_draft_projection", { p_brewery: ctx.breweryId, p_location: i.locationId })),
});
