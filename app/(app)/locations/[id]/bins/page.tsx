// app/(app)/locations/[id]/bins/page.tsx — Location bins: list_bins for one
// location, each row's stock count from get_bin_move_stock (Warehouse or
// admin, who also get Add/Edit via bin-form.tsx and Move stock via
// move-stock-form.tsx, or the reason it is unavailable).
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { isUuid } from "@/lib/commands/context";
import { notFound } from "next/navigation";
import { MoveStockForm } from "../../move-stock-form";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { BinForm } from "../../bin-form";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/locations") };

type LocationRow = { id: string; name: string };
type BinRow = { id: string; name: string };

export default async function LocationBinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const location = ((await runCommand("list_locations", {}, ctx)) as LocationRow[]).find((l) => l.id === id);
  if (!location) notFound();
  const bins = (await runCommand("list_bins", { locationId: id }, ctx)) as BinRow[];
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  const stock = canWrite ? await runCommand("get_bin_move_stock", { locationId: id }, ctx) as BinMoveStock[] : undefined;
  return <LocationBinsView
    model={toLocationBinsViewProps({ location, bins, stock, backHref: `/locations/${id}`, inventoryHref: `/inventory?recordMovement=1&locationId=${id}` })}
    createAction={canWrite ? <BinForm locationId={id} bins={bins} /> : null}
    rowActions={Object.fromEntries(bins.map(b => [b.id, canWrite ? <BinForm locationId={id} bins={bins} bin={b} /> : null]))}
    // An empty stock list still passes the form: belowRows draws the empty
    // state (or the two-bin gate) ahead of the footer.
    footer={stock ? <MoveStockForm bins={bins} stock={stock} /> : null}
  />;
}
