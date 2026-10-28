// app/(app)/locations/[id]/page.tsx — Location detail (screen record
// Location detail): name and uses with Edit → update_location, then the
// location's bins (#1507). Timezone is the brewery's (Settings → Timezone,
// read from the membership). Bins come from list_bins, each with its stock
// count from get_bin_move_stock for Warehouse or admin, who also get Add/Edit
// via bin-form.tsx and Move stock via move-stock-form.tsx, or the reason it
// is unavailable.
import { LocationView } from "@/components/mgr/views/location";
import { LocationBinsView } from "@/components/mgr/views/location-bins";
import { toLocationViewProps } from "@/lib/mgr/location-view";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { BinMoveStock } from "@/lib/commands/inventory";
import "@/lib/commands/all";
import { LocationForm } from "../location-form";
import { BinForm } from "../bin-form";
import { MoveStockForm } from "../move-stock-form";
import { getLocationPageData } from "../location-data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { location } = await getLocationPageData(id);
  return { title: location.name };
}

type BinRow = { id: string; name: string };

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, location } = await getLocationPageData(id);
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  const [bins, stock] = await Promise.all([
    runCommand("list_bins", { locationId: id }, ctx) as Promise<BinRow[]>,
    canWrite ? runCommand("get_bin_move_stock", { locationId: id }, ctx) as Promise<BinMoveStock[]> : undefined,
  ]);
  return <LocationView
    model={toLocationViewProps({ location, timezone: brewery.timeZone, backHref: "/locations" })}
    headerAction={brewery.roles.includes("admin") ? <LocationForm location={location} /> : null}
    readOnly
    bins={<LocationBinsView
      model={toLocationBinsViewProps({ bins, stock, inventoryHref: `/inventory?recordMovement=1&locationId=${id}` })}
      createAction={canWrite ? <BinForm locationId={id} bins={bins} /> : null}
      rowActions={Object.fromEntries(bins.map(b => [b.id, canWrite ? <BinForm locationId={id} bins={bins} bin={b} /> : null]))}
      // An empty stock list still passes the form: belowRows draws the empty
      // state (or the two-bin gate) ahead of the footer.
      footer={stock ? <MoveStockForm bins={bins} stock={stock} /> : null}
    />}
  />;
}
