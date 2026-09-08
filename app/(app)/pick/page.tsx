// app/(app)/pick/page.tsx — Pick sheet (screen record): confirmed and picked
// orders from daily_pick_sheet grouped by requested ship date, each row
// opening that order. Print via print-button.tsx (the @media print rule in
// app/globals.css hides the shell chrome).
import { PickSheetView } from "@/components/mgr/views/pick-sheet";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toPickSheetViewProps } from "@/lib/mgr/pick-sheet-view";
import "@/lib/commands/all";
import { PrintButton } from "./print-button";

type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null };
type Order = { id: string; order_no: number | null; status: string; requested_ship_date: string | null; customers: { name: string } | null; order_lines: OrderLine[] };

export default async function PickSheetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const orders = (await runCommand("daily_pick_sheet", date ? { date } : {}, ctx)) as Order[];
  return (
    <PickSheetView
      model={toPickSheetViewProps({ orders })}
      printAction={<PrintButton />}
      filters={null}
      linkRows
      backHref="/work"
    />
  );
}
