import Link from "next/link";
import { E } from "@/components/mgr/e";
import { LinkTabs } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TaproomCountSnapshot } from "@/lib/mgr/taproom-count-state";
import { plural } from "@/lib/mgr/plural";
import "@/lib/commands/all";
import { TaproomCountForm, TaproomPrintWorksheet, type DraftProjection, type PrintLabel } from "./count-form";

type Location = { id: string; name: string; kind: string };
type CountHeader = { id: string; location_id: string; counted_on: string; counted_by: string; created_at: string; prior_count_id: string | null; observations: number; movements: number; depleted_units: number };
type ReceiptLine = { id: string; bin_id: string; bin_name: string | null; sku_id: string; sku_name: string | null; lot_id: string | null; qty_before: number; qty_counted: number; movement_id: string | null; bbl: number | null };
type Receipt = CountHeader & { lines: ReceiptLine[] };
const key = (binId: string, skuId: string, lotId: string | null) => `${binId}:${skuId}:${lotId ?? "untracked"}`;

export default async function TaproomPage({ searchParams }: { searchParams: Promise<{ location?: string; count?: string }> }) {
  const selected = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_taproom_count_snapshot", "Weekly count");
  const locations = (await runCommand("list_locations", {}, ctx) as Location[]).filter((location) => location.kind === "taproom");
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <>{E.back("Beer", "Weekly count", undefined, "/beer")}{E.blank("No taproom locations yet. Ask Admin to add one under Locations.")}</>;

  const snapshot = await runCommand("get_taproom_count_snapshot", { locationId: location.id }, ctx) as TaproomCountSnapshot;
  const [printLabels, projection, history] = await Promise.all([
    runCommand("get_taproom_print_labels", { locationId: location.id, revision: snapshot.revision }, ctx) as Promise<PrintLabel[]>,
    runCommand("get_taproom_draft_projection", { locationId: location.id }, ctx) as Promise<DraftProjection>,
    runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<CountHeader[]>,
  ]);
  const receipt = selected.count ? await runCommand("get_taproom_count", { countId: selected.count }, ctx) as Receipt : null;
  const shownReceipt = receipt?.location_id === location.id ? receipt : null;
  const lotLabels = Object.fromEntries(printLabels.filter((row) => row.lot_id && row.lot_code).map((row) => [key(row.bin_id, row.sku_id, row.lot_id), row.lot_code!]));

  return <>
    <div className="contents print:hidden">
      {E.back("Beer", "Weekly count", undefined, "/beer")}
      <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" href={`/taproom/board?location=${location.id}`}>Tap board</Link><Link className="underline" href={`/taproom/variance?location=${location.id}`}>Variance by brand</Link></div>
      <LinkTabs items={locations.map((item) => [item.name, `/taproom?location=${item.id}`])} current={location.name} className="w-full md:w-fit" />
    </div>
    <TaproomPrintWorksheet key={`${location.id}:${snapshot.revision}`} breweryId={brewery.id} locationId={location.id} locationName={location.name} revision={snapshot.revision} initialLabels={printLabels} />
    <div className="contents print:hidden">
      <TaproomCountForm key={`${location.id}:${snapshot.revision}`} breweryId={brewery.id} snapshot={snapshot} projection={projection} lotLabels={lotLabels} role={brewery.role as "admin" | "warehouse" | "taproom"} />
      {shownReceipt && <section aria-labelledby="receipt-heading" className="rounded-xl border p-4">
      <h2 id="receipt-heading" className="text-lg font-semibold">Saved count · {shownReceipt.counted_on}</h2>
      <p className="text-sm text-muted-foreground">Recorded by {shownReceipt.counted_by === ctx.userId ? "you" : "staff"} at <time dateTime={shownReceipt.created_at}>{new Date(shownReceipt.created_at).toLocaleString()}</time>{shownReceipt.prior_count_id ? <> · <Link className="underline" href={`/taproom?location=${location.id}&count=${shownReceipt.prior_count_id}`}>prior count</Link></> : " · first count"}</p>
      {shownReceipt.lines.map((line, index) => <div key={line.id}>{E.row(line.sku_name ?? "Saved SKU", `${line.bin_name ?? "Saved bin"} · ${line.lot_id ? brewery.role === "taproom" ? `tracked · saved worksheet row ${index + 1}` : `tracked lot${lotLabels[key(line.bin_id, line.sku_id, line.lot_id)] ? ` ${lotLabels[key(line.bin_id, line.sku_id, line.lot_id)]}` : ""}` : "untracked stock"} · ${Number(line.qty_before)} recorded → ${Number(line.qty_counted)} counted · ${line.bbl == null ? "0 bbl depleted" : `${Math.abs(Number(line.bbl))} bbl depleted`}`, <span className="break-all text-xs">{line.movement_id ? `movement ${line.movement_id}` : "matched · no movement"}</span>)}</div>)}
      </section>}
      <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-lg font-semibold">Recent saved counts</h2>
      <p className="text-sm text-muted-foreground">Newest 50 at this taproom.</p>
      {history.length === 0 ? E.blank("No saved counts yet") : history.map((count) => <div key={count.id}>{E.row(`Weekly count · ${count.counted_on}`, `${new Date(count.created_at).toLocaleString()} · ${plural(count.observations, "observation")} · ${plural(count.movements, "movement")} · ${plural(count.depleted_units, "unit")} depleted`, E.act("Open count", "primary", `/taproom?location=${location.id}&count=${count.id}`))}</div>)}
      </section>
      <p className="text-sm text-muted-foreground">Saved counts cannot be corrected yet. Ask Admin to investigate; a generic inventory adjustment does not reverse count depletion or tax reporting.</p>
    </div>
  </>;
}
