// lib/commands/landings.ts — the two reads behind the Beer and Work landings
// (Program 10 task 2). get_beer_overview counts what each Beer area has to say
// for itself; list_work unions Today's rows with the open purchase orders and
// routes the caller's role may open, each tagged with the Work chip that
// filters it. Both read through the RLS-bound ctx.db and refuse nothing: a
// role that may not open an area simply gets no rows from it.
import { z } from "zod";
import { canRun, CommandError, completeRows, defineQuery, inChunks, PAGE_SIZE, runCommand, STAFF_ROLES, unwrap } from "./registry";
import type { TodayItem } from "./today";
import { formatDate } from "@/lib/date-format";
import { poNo } from "@/lib/mgr/doc-no";
import { plural } from "@/lib/mgr/plural";
import { TODAY_VERB } from "@/lib/mgr/today-view";
import { onlyRoles } from "@/lib/mgr/roles";
import type { StaffRole } from "./registry";

export type WorkKind = "orders" | "transfers" | "batches" | "runs" | "POs" | "routes";
/** `id` is the row's own identity: two rows can share an href (two open questions on one invoice). */
type OpenRoute = { id: string; name: string | null; delivery_date: string; departed_at: string | null; deliveries: { count: number }[] };
export type WorkRow = { kind: WorkKind; id: string; label: string; detail: string; href: string; verb: string; tone: "info" | "attention" | "success"; dueAt: string | null };

const KIND: Record<TodayItem["reason"], WorkKind> = {
  submitted_order: "orders", pick_due: "orders", ship_due: "orders", restock_due: "orders", delivery_next: "routes", refused_return: "routes", refused_credit: "orders", fermentation_reading_overdue: "batches", invoice_question: "orders",
};
/** Each role's default Work chips; explicit chip choices are remembered on the client. */
const DEFAULT_WORK_KINDS: Record<StaffRole, readonly WorkKind[]> = {
  admin: ["orders", "transfers", "batches", "runs", "POs", "routes"],
  sales: ["orders"], warehouse: ["orders", "transfers", "POs", "routes"], brewer: ["batches", "runs", "POs"], taproom: [],
};

/** Union the caller's defaults in the same stable order as the Work chips. */
export function defaultWorkKinds(roles: readonly (StaffRole | "customer")[]): WorkKind[] {
  return DEFAULT_WORK_KINDS.admin.filter(kind => roles.some(role =>
    role !== "customer" && DEFAULT_WORK_KINDS[role].includes(kind)));
}

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
};

export function labeledTaproomStock(
  stock: { sku_id: string; location_id: string; qty: number }[],
  skuNames: Map<string, string>,
  locationNames: Map<string, string>,
) {
  return stock.map((row) => {
    const sku = skuNames.get(row.sku_id);
    const location = locationNames.get(row.location_id);
    if (sku === undefined || location === undefined) {
      throw new CommandError("Stock changed while loading. Reload to review it.", 409, "conflict");
    }
    return { skuId: row.sku_id, locationId: row.location_id, sku, location, qty: Number(row.qty) };
  });
}

defineQuery({
  name: "get_beer_overview",
  description: "Counts behind the Beer landing: finished-goods shortages, taproom SKUs below par, kegs on tap, occupied tanks and kegs out at customers",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx) => {
    const b = ctx.breweryId;
    if (onlyRoles(ctx.roles, ["taproom"])) {
      const stock = await completeRows("Stock", start => ctx.db.from("on_hand").select("sku_id, location_id, qty", { count: "exact" })
        .eq("brewery_id", b).order("sku_id").order("location_id").range(start, start + PAGE_SIZE - 1));
      // Resolve only referenced labels in bounded batches, through the same RLS boundary.
      async function names(table: "skus" | "locations", ids: string[]) {
        const rows = await inChunks(ids, async chunk => (await unwrap(ctx.db.from(table).select("id, name").eq("brewery_id", b).in("id", chunk))) ?? []);
        return new Map(rows.map(row => [row.id, row.name]));
      }
      const [skuNames, locationNames] = await Promise.all([
        names("skus", [...new Set(stock.map(s => s.sku_id))]),
        names("locations", [...new Set(stock.map(s => s.location_id))]),
      ]);
      return { taproomStock: labeledTaproomStock(stock, skuNames, locationNames) };
    }
    const [fgShortages, aggregates, openTaps, openOccupancies] = await Promise.all([
      count(ctx.db.from("atp").select("sku_id", { count: "exact", head: true }).eq("brewery_id", b).lt("qty", 0)),
      unwrap(ctx.db.rpc("get_beer_overview_aggregates", { p_brewery: b }).single()),
      count(ctx.db.from("tap_intervals").select("id", { count: "exact", head: true }).eq("brewery_id", b).is("closed_at", null)),
      count(ctx.db.from("occupancy_volumes").select("occupancy_id", { count: "exact", head: true }).eq("brewery_id", b).is("ended_at", null)),
    ]);
    return {
      fgShortages,
      taproomBelowPar: Number(aggregates!.taproom_below_par),
      openTaps,
      openOccupancies,
      kegsOut: Number(aggregates!.kegs_out),
    };
  },
});

defineQuery({
  name: "list_work",
  description: "Everything in motion for the Work landing: Today's rows plus the open purchase orders and routes the caller may open, each tagged with its Work chip and sorted by due date",
  input: z.object({}), roles: ["admin", "sales", "warehouse", "brewer"],
  handler: async (ctx): Promise<WorkRow[]> => {
    // ponytail: Today supplies orders, routes and batches only; stock transfers and runs are never listed on Work (their list pages are one tap away)
    const [today, pos, routes] = await Promise.all([
      runCommand("get_today", {}, ctx) as Promise<TodayItem[]>,
      canRun(ctx, "list_purchase_orders") ? runCommand("list_purchase_orders", {}, ctx) as Promise<{ id: string; po_no: number; status: string; expected_on: string | null; vendor_name: string | null }[]> : [],
      // The open routes list_routes lists (gated by its roles), with a stop count: Work never shows the
      // stops, so it does not read them (#759). Ordered like list_routes so same-day routes keep their order.
      canRun(ctx, "list_routes") ? completeRows("Open routes", (start) => ctx.db.from("routes")
        .select("id, name, delivery_date, departed_at, deliveries(count)", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).is("returned_at", null)
        .order("delivery_date").order("created_at").order("id").range(start, start + PAGE_SIZE - 1)) as unknown as Promise<OpenRoute[]> : [],
    ]);
    const rows: WorkRow[] = [
      ...today.map((t) => ({ kind: KIND[t.reason], id: t.subjectId, label: t.safeLabel, detail: t.detail, href: t.href, verb: TODAY_VERB[t.reason][0], tone: TODAY_VERB[t.reason][1], dueAt: t.dueAt })),
      ...pos.map((p) => ({
        kind: "POs" as const, id: p.id, label: `${poNo(p.po_no)} · ${p.vendor_name ?? "vendor"}`, detail: p.status.replace("_", " ") + (p.expected_on ? ` · due ${formatDate(p.expected_on)}` : ""),
        href: `/purchase-orders/${p.id}`, verb: p.status === "draft" ? "Mark sent" : "Receive", tone: "info" as const, dueAt: p.expected_on,
      })),
      ...routes.map((r) => ({
        kind: "routes" as const, id: r.id, label: r.name ?? "Route", detail: `${plural(r.deliveries[0]?.count ?? 0, "stop")} · ${formatDate(r.delivery_date)}`,
        href: `/routes/${r.id}`, verb: r.departed_at ? "Return" : "Depart", tone: "info" as const, dueAt: r.delivery_date,
      })),
    ];
    return rows.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  },
});
