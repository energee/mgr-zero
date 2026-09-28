// lib/commands/delivery.ts — delivery routes (Program 8). A route is a date,
// a driver and ordered stops; a stop is a shipped customer shipment or a
// picked stock transfer (locations spec Decision 4). save_route writes the
// header and replaces the stops in one RPC; confirm_delivery stays in
// orders.ts (Program 1) and stamps transfer stops without invoicing.
import { z } from "zod";
import { docNo, trfNo } from "@/lib/mgr/doc-no";
import { breweryToday, completeRows, defineCommand, defineQuery, inChunks, PAGE_SIZE, rows, unwrap } from "./registry";

const ROLES = ["admin", "warehouse"] as const;
const READ = ["admin", "warehouse", "sales"] as const;

const stop = z.object({ shipmentId: z.string().uuid().optional(), stockTransferId: z.string().uuid().optional(), stopNo: z.number().int().positive() });

defineCommand({
  name: "save_route", description: "Create or edit a delivery route and replace its stops (shipments or stock transfers) in one step; delivered stops must be kept and a departed route cannot change",
  roles: [...ROLES],
  input: z.object({
    id: z.string().uuid().optional(), name: z.string().optional(), deliveryDate: z.string().date(),
    driverUserId: z.string().uuid().optional(), vehicle: z.string().optional(), note: z.string().optional(), stops: z.array(stop),
  }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("save_route", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_name: i.name ?? null, p_delivery_date: i.deliveryDate, p_driver: i.driverUserId ?? null,
    p_vehicle: i.vehicle ?? null, p_note: i.note ?? null,
    p_stops: i.stops.map((s) => ({ shipment_id: s.shipmentId ?? null, stock_transfer_id: s.stockTransferId ?? null, stop_no: s.stopNo })),
    p_request_id: execution.requestId,
  })),
});

type ShipmentRow = { id: string; orders: { order_no: number | null; customers: { name: string } | null; ship_tos: { label: string } | null } | null };
type TransferRow = { id: string; transfer_no: number | null; to_location: { name: string } | null };
type RouteRow = { id: string; name: string | null; delivery_date: string; driver_user_id: string | null; vehicle: string | null; note: string | null; departed_at: string | null; returned_at: string | null };
export type DeliveryRow = { id: string; route_id: string; stop_no: number; outcome?: string | null; outstanding_qty?: number; delivered_at: string | null; shipment_id: string | null; stock_transfer_id: string | null };
/** A document a stop can deliver, with its one line of copy: "ORD-0012 · Ridgeline · Dock" / "TRF-0003 · Storage". */
export type StopDoc = { id: string; label: string; kind: "shipment" | "transfer" };

/** A stop with the document it delivers embedded, so its label never depends on a brewery-wide read. */
type StopRow = DeliveryRow & { shipments: ShipmentRow | null; stock_transfers: TransferRow | null };
const SHIPMENT_LABEL = "orders(order_no, customers(name), ship_tos(label))";
const TRANSFER_LABEL = "transfer_no, to_location:locations!stock_transfers_to_location_id_brewery_id_fkey(name)";

const shipmentDoc = (s: ShipmentRow): StopDoc => ({ id: s.id, kind: "shipment", label: [docNo("ORD", s.orders?.order_no ?? null, "Order"), s.orders?.customers?.name, s.orders?.ship_tos?.label].filter(Boolean).join(" · ") });
const transferDoc = (t: TransferRow): StopDoc => ({ id: t.id, kind: "transfer", label: [trfNo(t.transfer_no), t.to_location?.name].filter(Boolean).join(" · ") });

defineQuery({
  name: "list_routes", description: "Delivery routes with their stops (one route by id, one day, or every route not yet returned), the shipped orders and picked transfers on no route, and the members who may drive",
  roles: [...READ],
  input: z.object({ id: z.string().uuid().optional(), date: z.string().date().optional() }),
  handler: async (ctx, i) => {
    let q = ctx.db.from("routes").select("*").eq("brewery_id", ctx.breweryId).order("delivery_date").order("created_at");
    q = i.id ? q.eq("id", i.id) : i.date ? q.eq("delivery_date", i.date) : q.is("returned_at", null);
    // Read only what the page shows: the listed routes' stops, and the documents on no route (an
    // anti-join on deliveries), each read whole by completeRows however many pages it spans (#473).
    // ponytail: a carrier-shipped order still waits in "unassigned" until someone routes it; a
    // shipment-level "handed to carrier" state is the upgrade path once that list outgrows one screen
    const [routes, shipments, transfers, drivers, today] = await Promise.all([
      rows<RouteRow>(q),
      completeRows("Unrouted shipments", (start) => ctx.db.from("shipments").select(`id, ${SHIPMENT_LABEL}, deliveries(id)`, { count: "exact" })
        .eq("brewery_id", ctx.breweryId).is("deliveries", null).order("id").range(start, start + PAGE_SIZE - 1)) as unknown as Promise<ShipmentRow[]>,
      completeRows("Unrouted transfers", (start) => ctx.db.from("stock_transfers").select(`id, ${TRANSFER_LABEL}, deliveries(id)`, { count: "exact" })
        .eq("brewery_id", ctx.breweryId).in("status", ["picked", "in_transit"]).is("deliveries", null).order("id").range(start, start + PAGE_SIZE - 1)) as unknown as Promise<TransferRow[]>,
      unwrap(ctx.db.from("brewery_users").select("user_id, role").eq("brewery_id", ctx.breweryId).in("role", ["admin", "warehouse"])),
      breweryToday(ctx),
    ]);
    const routeIds = routes.map((r) => r.id);
    const deliveries = await inChunks(routeIds, (chunk) => completeRows("Route stops", (start) => ctx.db.from("deliveries")
      .select(`*, shipments(id, ${SHIPMENT_LABEL}), stock_transfers(id, ${TRANSFER_LABEL})`, { count: "exact" })
      .eq("brewery_id", ctx.breweryId).in("route_id", chunk).order("id").range(start, start + PAGE_SIZE - 1)) as unknown as Promise<StopRow[]>);
    const outstanding = await inChunks(routeIds, (chunk) => completeRows("Route returns", (start) => ctx.db.from("refused_delivery_returns")
      .select("delivery_id, outstanding_qty", { count: "exact" }).eq("brewery_id", ctx.breweryId).in("route_id", chunk).gt("outstanding_qty", 0)
      .order("order_line_id").range(start, start + PAGE_SIZE - 1)));
    deliveries.sort((a, b) => a.stop_no - b.stop_no);
    return {
      routes: routes.map((r) => ({
        ...r,
        stops: deliveries.filter((d) => d.route_id === r.id).map(({ shipments: sh, stock_transfers: tr, ...d }) => ({
          ...d, outstanding_qty: outstanding.filter((r) => r.delivery_id === d.id).reduce((sum, r) => sum + Number(r.outstanding_qty), 0), label: sh ? shipmentDoc(sh).label : tr ? transferDoc(tr).label : "Stop",
        })),
      })),
      unassigned: [...shipments.map(shipmentDoc), ...transfers.map(transferDoc)],
      drivers,
      today,
    };
  },
});

defineQuery({
  name: "get_delivery_stop", description: "One delivery stop: route, ship-to or destination, its lines (shipped or picked quantities), invoice timing, and whether it is signed",
  roles: [...READ],
  input: z.object({ deliveryId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const delivery = await unwrap(ctx.db.from("deliveries")
      .select("id, stop_no, delivered_at, signed_by, outcome, refusal_reason, refusal_note, routes(id, name, delivery_date, driver_user_id, departed_at), shipments(id, invoice_timing, orders(id, order_no, customers(name), ship_tos(label, city, state))), stock_transfers(id, transfer_no, to_location:locations!stock_transfers_to_location_id_brewery_id_fkey(name))")
      .eq("id", i.deliveryId).single());
    // to-one embeds come back as objects; without generated types supabase-js says array
    const { shipments, stock_transfers } = delivery as unknown as { shipments: { id: string; orders: { id: string } } | null; stock_transfers: { id: string } | null };
    // lines are {id, name, qty} whichever document the stop delivers
    if (shipments) {
      const [lines, invoice] = await Promise.all([
        rows<{ id: string; qty_shipped: number; qty_refused: number; skus: { name: string } | null }>(ctx.db.from("order_lines").select("id, qty_shipped, qty_refused, skus(name)").eq("order_id", shipments.orders.id).gt("qty_shipped", 0)),
        unwrap(ctx.db.from("invoices").select("id, invoice_no").eq("shipment_id", shipments.id).eq("kind", "invoice").maybeSingle()),
      ]);
      return { delivery, lines: lines.map((l) => ({ id: l.id, name: l.skus?.name ?? "Line", qty: Number(l.qty_shipped), refused: Number(l.qty_refused) })), invoice };
    }
    const picked = await rows<{ id: string; qty_picked: number | null; skus: { name: string } | null; materials: { name: string } | null; keg_pools: { name: string } | null }>(
      ctx.db.from("stock_transfer_lines").select("id, qty_picked, skus(name), materials(name), keg_pools(name)").eq("transfer_id", stock_transfers!.id));
    return { delivery, lines: picked.map((l) => ({ id: l.id, name: (l.skus ?? l.materials ?? l.keg_pools)?.name ?? "Line", qty: Number(l.qty_picked ?? 0) })), invoice: null };
  },
});

const routeInput = z.object({ routeId: z.string().uuid() });

defineCommand({
  name: "depart_route", description: "Stamp the route's departure as its driver or an admin; needs at least one stop, and its transfer stops become in transit",
  roles: [...ROLES], input: routeInput,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("depart_route", { p_route: i.routeId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "return_route", description: "Stamp the route's return as its driver or an admin, once it has departed and every stop has an outcome",
  roles: [...ROLES], input: routeInput,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("return_route", { p_route: i.routeId, p_request_id: execution.requestId })),
});


defineCommand({
  name: "check_in_refused_return", description: "Physically check in refused on-delivery beer at its shipped source lot; damaged quantities also post loss, without a credit",
  roles: [...ROLES],
  input: z.object({ deliveryId: z.string().uuid(), locationId: z.string().uuid(), lines: z.array(z.object({
    orderLineId: z.string().uuid(), sources: z.array(z.object({ movementId: z.string().uuid(), binId: z.string().uuid(), qty: z.number().int().positive(), damaged: z.boolean() })).min(1),
  })).min(1) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("check_in_refused_return", {
    p_delivery: i.deliveryId, p_location: i.locationId, p_request_id: execution.requestId,
    p_lines: i.lines.map((l) => ({ order_line_id: l.orderLineId, sources: l.sources.map((s) => ({ movement_id: s.movementId, bin_id: s.binId, qty: s.qty, damaged: s.damaged })) })),
  })),
});

defineQuery({
  name: "list_refused_returns", description: "Outstanding refused beer, including returned routes, awaiting physical check-in or Return and credit",
  roles: [...READ], input: z.object({ deliveryId: z.string().uuid().optional(), routeId: z.string().uuid().optional() }),
  handler: (ctx, i) => completeRows("Refused beer", (start) => {
    let q = ctx.db.from("refused_delivery_returns").select("*", { count: "exact" }).eq("brewery_id", ctx.breweryId).gt("outstanding_qty", 0);
    if (i.deliveryId) q = q.eq("delivery_id", i.deliveryId);
    if (i.routeId) q = q.eq("route_id", i.routeId);
    return q.order("order_line_id").range(start, start + PAGE_SIZE - 1);
  }),
});
