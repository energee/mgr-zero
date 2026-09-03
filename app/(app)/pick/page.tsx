// app/(app)/pick/page.tsx — daily pick sheet: confirmed/picked orders from
// daily_pick_sheet, grouped by requested_ship_date with lines shown inline;
// print via print-button.tsx (see the @media print rule in app/globals.css
// that hides the shell chrome). Recording actual picks happens on the order
// detail page (pick-form.tsx), linked from here.
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { PrintButton } from "./print-button";

type OrderLine = {
  id: string;
  sku_id: string;
  qty_ordered: number;
  qty_picked: number | null;
  skus: { name: string } | null;
};
type Order = {
  id: string;
  order_no: number | null;
  status: string;
  requested_ship_date: string | null;
  customers: { name: string } | null;
  order_lines: OrderLine[];
};

export default async function PickSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const orders = (await runCommand("daily_pick_sheet", date ? { date } : {}, ctx)) as Order[];

  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.requested_ship_date ?? "Unscheduled";
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pick sheet</h1>
        <PrintButton />
      </div>

      {groups.size === 0 && <p className="text-sm text-muted-foreground">No confirmed orders to pick.</p>}

      {[...groups.entries()].map(([shipDate, group]) => (
        <section key={shipDate} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{shipDate}</h2>
          {group.map((o) => (
            <div key={o.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Link href={`/orders/${o.id}`} className="font-medium underline underline-offset-2">
                  Order {o.order_no ?? o.id.slice(0, 8)} — {o.customers?.name ?? "—"}
                </Link>
                <span className="text-xs text-muted-foreground">{o.status}</span>
              </div>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 font-normal">SKU</th>
                    <th className="py-1 font-normal">Ordered</th>
                    <th className="py-1 font-normal">Picked</th>
                  </tr>
                </thead>
                <tbody>
                  {o.order_lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1">{l.skus?.name ?? l.sku_id.slice(0, 8)}</td>
                      <td className="py-1">{l.qty_ordered}</td>
                      <td className="py-1">{l.qty_picked ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
