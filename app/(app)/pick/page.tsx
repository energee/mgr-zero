// app/(app)/pick/page.tsx — Pick sheet (screen record): confirmed and picked
// orders from daily_pick_sheet grouped by requested ship date, each row
// opening that order's Pick, plus the day's totals so a picker carries one
// load out. Nothing here writes; print via print-button.tsx (the @media
// print rule in app/globals.css hides the shell chrome).
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import "@/lib/commands/all";
import { PrintButton } from "./print-button";

type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null };
type Order = { id: string; order_no: number | null; status: string; requested_ship_date: string | null; customers: { name: string } | null; order_lines: OrderLine[] };

export default async function PickSheetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const orders = (await runCommand("daily_pick_sheet", date ? { date } : {}, ctx)) as Order[];
  const groups = Map.groupBy(orders, (o) => o.requested_ship_date ?? "Unscheduled");
  return (
    <>
      {E.back("Work", "Pick sheet", <PrintButton />, "/work")}
      {groups.size === 0 && E.blank("Nothing confirmed to pick")}
      {[...groups].map(([shipDate, group]) => {
        const totals = new Map<string, number>();
        for (const o of group) for (const l of o.order_lines) totals.set(l.skus?.name ?? "Line", (totals.get(l.skus?.name ?? "Line") ?? 0) + Number(l.qty_ordered));
        return (
          <div key={shipDate}>
            {E.ttl(shipDate)}
            {group.map((o) => (
              <div key={o.id}>{E.row(`${o.customers?.name ?? "Transfer"} · ${docNo("ORD", o.order_no, "Order")}`, `${o.order_lines.length} line${o.order_lines.length === 1 ? "" : "s"} · ${o.status}`, E.act(o.status === "picked" ? "Open" : "Pick", "info", `/orders/${o.id}`))}</div>
            ))}
            {E.row("Totals", [...totals].map(([name, qty]) => `${name} ${qty}`).join(" · "))}
          </div>
        );
      })}
    </>
  );
}
