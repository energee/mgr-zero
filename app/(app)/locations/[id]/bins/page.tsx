// app/(app)/locations/[id]/bins/page.tsx — Location bins: list_bins for one
// location, Add/Edit via bin-form.tsx. Warehouse or admin.
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
  const canWrite = brewery.role === "admin" || brewery.role === "warehouse";
  const stock = canWrite ? await runCommand("get_bin_move_stock", { locationId: id }, ctx) as BinMoveStock[] : [];
  return <LocationBinsView
    model={toLocationBinsViewProps({ location, bins, backHref: `/locations/${id}` })}
    createAction={canWrite ? <BinForm locationId={id} /> : null}
    bins={bins.map(b => ({ key: b.id, title: b.name, detail: "", action: canWrite ? <BinForm locationId={id} bin={b} /> : null }))}
    footer={canWrite ? <MoveStockForm bins={bins} stock={stock} /> : null}
  />;
}
