// lib/commands/delivery.ts — delivery routes (Program 8). A route is a date,
// a driver and ordered stops; a stop is a shipped customer shipment or a
// picked stock transfer (locations spec Decision 4). save_route writes the
// header and replaces the stops in one RPC; confirm_delivery stays in
// orders.ts (Program 1) and stamps transfer stops without invoicing.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const ROLES: ("admin" | "warehouse")[] = ["admin", "warehouse"];
const READ: ("admin" | "warehouse" | "sales")[] = ["admin", "warehouse", "sales"];

const stop = z.object({ shipmentId: z.string().uuid().optional(), stockTransferId: z.string().uuid().optional(), stopNo: z.number().int().positive() });

defineCommand({
  name: "save_route", description: "Create or edit a delivery route and replace its stops (shipments or stock transfers) in one step; delivered stops must be kept and a departed route cannot change",
  roles: ROLES,
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

const docNo = (prefix: string, n: number | null) => `${prefix}-${String(n ?? 0).padStart(4, "0")}`;

type ShipmentRow = { id: string; invoice_timing: string; shipped_at: string; orders: { order_no: number | null; customers: { name: string } | null; ship_tos: { label: string } | null } | null };
type TransferRow = { id: string; transfer_no: number | null; status: string; to_location: { name: string } | null };
type DeliveryRow = { id: string; route_id: string; stop_no: number; delivered_at: string | null; shipment_id: string | null; stock_transfer_id: string | null };

/** One line of copy per document: "ORD-0012 · Ridgeline · Dock" / "TRF-0003 · Storage". */
const shipmentLabel = (s: ShipmentRow) => [docNo("ORD", s.orders?.order_no ?? null), s.orders?.customers?.name, s.orders?.ship_tos?.label].filter(Boolean).join(" · ");
const transferLabel = (t: TransferRow) => [docNo("TRF", t.transfer_no), t.to_location?.name].filter(Boolean).join(" · ");

defineQuery({
  name: "list_routes", description: "Delivery routes with their stops (one day, or every route not yet returned), the shipped orders and picked transfers on no route, and the members who may drive",
  roles: READ,
  input: z.object({ date: z.string().date().optional() }),
  handler: async (ctx, i) => {
    let q = ctx.db.from("routes").select("*").eq("brewery_id", ctx.breweryId).order("delivery_date").order("created_at");
    q = i.date ? q.eq("delivery_date", i.date) : q.is("returned_at", null);
    const [routes, deliveries, shipments, transfers, drivers] = await Promise.all([
      unwrap(q) as Promise<Record<string, unknown>[]>,
      unwrap(ctx.db.from("deliveries").select("*").eq("brewery_id", ctx.breweryId).order("stop_no")) as Promise<DeliveryRow[]>,
      unwrap(ctx.db.from("shipments").select("id, invoice_timing, shipped_at, orders(order_no, customers(name), ship_tos(label))").eq("brewery_id", ctx.breweryId)) as unknown as Promise<ShipmentRow[]>,
      unwrap(ctx.db.from("stock_transfers").select("id, transfer_no, status, to_location:locations!stock_transfers_to_location_id_brewery_id_fkey(name)")
        .eq("brewery_id", ctx.breweryId).in("status", ["picked", "in_transit"])) as unknown as Promise<TransferRow[]>,
      unwrap(ctx.db.from("brewery_users").select("user_id, role").eq("brewery_id", ctx.breweryId).in("role", ["admin", "warehouse"])),
    ]);
    const shipmentById = new Map(shipments.map((s) => [s.id, s]));
    const transferById = new Map(transfers.map((t) => [t.id, t]));
    const label = (d: DeliveryRow) => {
      const s = d.shipment_id ? shipmentById.get(d.shipment_id) : undefined;
      const t = d.stock_transfer_id ? transferById.get(d.stock_transfer_id) : undefined;
      return s ? shipmentLabel(s) : t ? transferLabel(t) : "Stop";
    };
    const onRoute = new Set(deliveries.flatMap((d) => [d.shipment_id, d.stock_transfer_id]));
    return {
      routes: routes.map((r) => ({ ...r, stops: deliveries.filter((d) => d.route_id === r.id).map((d) => ({ ...d, label: label(d) })) })),
      unassigned: {
        shipments: shipments.filter((s) => !onRoute.has(s.id)).map((s) => ({ id: s.id, label: shipmentLabel(s) })),
        transfers: transfers.filter((t) => !onRoute.has(t.id)).map((t) => ({ id: t.id, label: transferLabel(t) })),
      },
      drivers,
    };
  },
});

defineQuery({
  name: "get_delivery_stop", description: "One delivery stop: route, ship-to or destination, shipped or picked lines, invoice timing, and whether it is signed",
  roles: READ,
  input: z.object({ deliveryId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const delivery = await unwrap(ctx.db.from("deliveries")
      .select("id, stop_no, delivered_at, signed_by, routes(id, name, delivery_date, driver_user_id), shipments(id, invoice_timing, orders(id, order_no, customers(name), ship_tos(label, city, state))), stock_transfers(id, transfer_no, to_location:locations!stock_transfers_to_location_id_brewery_id_fkey(name))")
      .eq("id", i.deliveryId).single());
    // to-one embeds come back as objects; without generated types supabase-js says array
    const { shipments, stock_transfers } = delivery as unknown as { shipments: { id: string; orders: { id: string } } | null; stock_transfers: { id: string } | null };
    if (shipments) {
      const [lines, invoice] = await Promise.all([
        unwrap(ctx.db.from("order_lines").select("id, qty_shipped, skus(name)").eq("order_id", shipments.orders.id).gt("qty_shipped", 0)),
        unwrap(ctx.db.from("invoices").select("id, invoice_no").eq("shipment_id", shipments.id).eq("kind", "invoice").maybeSingle()),
      ]);
      return { delivery, lines, invoice };
    }
    // a transfer stop carries what was picked; lines read the same shape as shipped order lines
    const picked = await unwrap(ctx.db.from("stock_transfer_lines").select("id, qty_picked, skus(name), materials(name), keg_pools(name)").eq("transfer_id", stock_transfers!.id)) as unknown as
      { id: string; qty_picked: number | null; skus: { name: string } | null; materials: { name: string } | null; keg_pools: { name: string } | null }[];
    const lines = picked.map((l) => ({ id: l.id, qty_shipped: l.qty_picked ?? 0, skus: l.skus ?? l.materials ?? l.keg_pools }));
    return { delivery, lines, invoice: null };
  },
});

const routeInput = z.object({ routeId: z.string().uuid() });

defineCommand({
  name: "depart_route", description: "Stamp the route's departure as its driver or an admin; needs at least one stop, and its transfer stops become in transit",
  roles: ROLES, input: routeInput,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("depart_route", { p_route: i.routeId, p_request_id: execution.requestId })),
});

defineCommand({
  name: "return_route", description: "Stamp the route's return as its driver or an admin, once it has departed and every stop is delivered",
  roles: ROLES, input: routeInput,
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("return_route", { p_route: i.routeId, p_request_id: execution.requestId })),
});
