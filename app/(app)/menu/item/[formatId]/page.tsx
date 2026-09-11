import { getActiveBrewery } from "@/lib/brewery";
import { E } from "@/components/mgr/e";
import { buildContext } from "@/lib/commands/context";
import { money } from "@/lib/mgr/money";
import { orNotFound } from "@/lib/mgr/not-found";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PosItemControl, PosRouteSheet } from "@/components/mgr/views/pos-controls";

type ObservedLocation = { externalLocationId: string; mgrLocationId: string | null };
type MenuItem = { brandId: string; formatId: string; brand: string; format: string; sources: { name: string; qty: number }[]; ounces: number | null; priceCents: number | null; priceOverrideCents: number | null; websitePublished: boolean; available: boolean };

export default async function PosItemPage({ params, searchParams }: { params: Promise<{ formatId: string }>; searchParams: Promise<{ location?: string }> }) {
  const [{ formatId }, selected] = await Promise.all([params, searchParams]);
  const brewery = await getActiveBrewery(), ctx = await buildContext(brewery.id);
  const observed = await runCommand("list_pos_locations", {}, ctx) as ObservedLocation[];
  const location = observed.find(row => row.mgrLocationId && row.externalLocationId === selected.location) ?? observed.find(row => row.mgrLocationId);
  if (!location) return orNotFound(Promise.resolve(null));
  const row = await orNotFound(runCommand("get_pos_menu_item", { posLocationId: location.externalLocationId, formatId }, ctx)) as MenuItem;
  const backHref = `/menu?location=${encodeURIComponent(location.externalLocationId)}`;
  return <>{E.back("Menu", `${row.brand} · ${row.format}`, undefined, backHref)}<PosRouteSheet title={`${row.brand} · ${row.format}`} backHref={backHref}><PosItemControl posLocationId={location.externalLocationId} brandId={row.brandId} formatId={row.formatId} item={{
    brand: row.brand, format: row.format, sources: row.sources.map(source => `${source.name} · ${source.qty}`).join(" · "),
    serving: row.ounces == null ? "Defined by format" : `${row.ounces} oz`, price: row.priceCents == null ? "No format price" : money(row.priceCents),
    override: row.priceOverrideCents == null ? "" : (row.priceOverrideCents / 100).toFixed(2), websitePublished: Boolean(row.websitePublished), available: Boolean(row.available),
  }} /></PosRouteSheet></>;
}
