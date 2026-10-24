// app/(app)/locations/[id]/bins/page.tsx — Location bins: list_bins for one
// location, each row's stock count from get_bin_move_stock (Warehouse or
// admin, who also get Add/Edit via bin-form.tsx and Move stock via
// move-stock-form.tsx, or the reason it is unavailable).
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { MoveStockForm } from "../../move-stock-form";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { BinForm } from "../../bin-form";
import { getLocationPageData } from "../../location-data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { location } = await getLocationPageData(id);
  return { title: `Bins at ${location.name}` };
}

type BinRow = { id: string; name: string };

export default async function LocationBinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, location } = await getLocationPageData(id);
  const bins = (await runCommand("list_bins", { locationId: id }, ctx)) as BinRow[];
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  const stock = canWrite ? await runCommand("get_bin_move_stock", { locationId: id }, ctx) as BinMoveStock[] : undefined;
  return <LocationBinsView
    model={toLocationBinsViewProps({ location, bins, stock, backHref: `/locations/${id}`, inventoryHref: `/inventory?recordMovement=1&locationId=${id}` })}
    createAction={canWrite ? <BinForm locationId={id} /> : null}
    rowActions={Object.fromEntries(bins.map(b => [b.id, canWrite ? <BinForm locationId={id} bin={b} /> : null]))}
    // An empty stock list still passes the form: belowRows draws the empty
    // state (or the two-bin gate) ahead of the footer.
    footer={stock ? <MoveStockForm bins={bins} stock={stock} /> : null}
  />;
}
