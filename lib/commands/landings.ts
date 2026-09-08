// lib/commands/landings.ts — the two reads behind the Beer and Work landings
// (Program 10 task 2). get_beer_overview counts what each Beer area has to say
// for itself; list_work unions Today's rows with the open purchase orders and
// routes the caller's role may open, each tagged with the Work chip that
// filters it. Both read through the RLS-bound ctx.db and refuse nothing: a
// role that may not open an area simply gets no rows from it.
import { z } from "zod";
import { canRun, defineQuery, runCommand, STAFF_ROLES, unwrap } from "./registry";
import type { TodayItem } from "./today";
import { poNo } from "@/lib/mgr/doc-no";
import { plural } from "@/lib/mgr/plural";

export type WorkKind = "orders" | "transfers" | "batches" | "runs" | "POs" | "routes";
export type WorkRow = { kind: WorkKind; label: string; detail: string; href: string; verb: string; tone: "info" | "attention" | "success"; dueAt: string | null };

const KIND: Record<TodayItem["reason"], WorkKind> = {
  submitted_order: "orders", pick_due: "orders", restock_due: "orders", delivery_next: "routes", fermentation_reading_overdue: "batches", invoice_question: "orders",
};
/** The verb and tone each Today reason offers; Today and Work read the same table. */
export const TODAY_VERB: Record<TodayItem["reason"], [string, WorkRow["tone"]]> = {
  submitted_order: ["Confirm", "success"], pick_due: ["Pick", "info"], restock_due: ["Put back", "attention"],
  delivery_next: ["Resume", "info"], fermentation_reading_overdue: ["Record", "info"], invoice_question: ["Answer", "info"],
};

/** The Work chips a role opens by default; an explicit chip choice is remembered on the client. */
export const DEFAULT_WORK_KINDS: Record<string, WorkKind[]> = {
  admin: ["orders", "transfers", "batches", "runs", "POs", "routes"],
  sales: ["orders"], warehouse: ["orders", "transfers", "POs", "routes"], brewer: ["batches", "runs", "POs"],
};

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
};

defineQuery({
  name: "get_beer_overview",
  description: "Counts behind the Beer landing: finished-goods shortages, taproom SKUs below par, open taps, tanks with beer, material shortages and kegs out at customers",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx) => {
    const b = ctx.breweryId;
    const [fgShortages, pars, onHand, openOccupancies, materialShortages, kegs] = await Promise.all([
      count(ctx.db.from("atp").select("sku_id", { count: "exact", head: true }).eq("brewery_id", b).lt("qty", 0)),
      unwrap(ctx.db.from("taproom_pars").select("location_id, sku_id, par_qty").eq("brewery_id", b)),
      unwrap(ctx.db.from("on_hand").select("location_id, sku_id, qty").eq("brewery_id", b)),
      count(ctx.db.from("occupancy_volumes").select("occupancy_id", { count: "exact", head: true }).eq("brewery_id", b).is("ended_at", null)),
      count(ctx.db.from("material_requirements").select("material_id", { count: "exact", head: true }).eq("brewery_id", b).gt("short", 0)),
      unwrap(ctx.db.from("keg_customer_balances").select("qty").eq("brewery_id", b)),
    ]);
    // ponytail: taproom_pars and on_hand are joined here rather than in SQL; a
    // view returning below-par and kegs-out as two scalars is the upgrade path
    // if a brewery's location × SKU grid outgrows one page
    const have = new Map((onHand ?? []).map((r) => [`${r.location_id}:${r.sku_id}`, Number(r.qty)]));
    return {
      fgShortages,
      taproomBelowPar: (pars ?? []).filter((p) => (have.get(`${p.location_id}:${p.sku_id}`) ?? 0) < Number(p.par_qty)).length,
      openTaps: 0, // ponytail: the tap board is Program 12; until then no tap is open
      openOccupancies,
      materialShortages,
      kegsOut: (kegs ?? []).reduce((n, k) => n + Number(k.qty), 0),
    };
  },
});

defineQuery({
  name: "list_work",
  description: "Everything in motion for the Work landing: Today's rows plus the open purchase orders and routes the caller may open, each tagged with its Work chip and sorted by due date",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx): Promise<WorkRow[]> => {
    // ponytail: transfers, batches and runs ride on Today's rows only; their list pages are one tap away
    const [today, pos, routes] = await Promise.all([
      runCommand("get_today", {}, ctx) as Promise<TodayItem[]>,
      canRun(ctx, "list_purchase_orders") ? runCommand("list_purchase_orders", {}, ctx) as Promise<{ id: string; po_no: number; status: string; expected_on: string | null; vendor_name: string | null }[]> : [],
      canRun(ctx, "list_routes") ? runCommand("list_routes", {}, ctx) as Promise<{ routes: { id: string; name: string | null; delivery_date: string; departed_at: string | null; stops: unknown[] }[] }> : { routes: [] },
    ]);
    const rows: WorkRow[] = [
      ...today.map((t) => ({ kind: KIND[t.reason], label: t.safeLabel, detail: t.detail, href: t.href, verb: TODAY_VERB[t.reason][0], tone: TODAY_VERB[t.reason][1], dueAt: t.dueAt })),
      ...pos.map((p) => ({
        kind: "POs" as const, label: `${poNo(p.po_no)} · ${p.vendor_name ?? "vendor"}`, detail: p.status.replace("_", " ") + (p.expected_on ? ` · due ${p.expected_on}` : ""),
        href: `/purchase-orders/${p.id}`, verb: p.status === "draft" ? "Send" : "Receive", tone: "info" as const, dueAt: p.expected_on,
      })),
      ...routes.routes.map((r) => ({
        kind: "routes" as const, label: r.name ?? "Route", detail: `${plural(r.stops.length, "stop")} · ${r.delivery_date}`,
        href: `/routes/${r.id}`, verb: r.departed_at ? "Return" : "Depart", tone: "info" as const, dueAt: r.delivery_date,
      })),
    ];
    return rows.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  },
});
