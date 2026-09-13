import { formatDateTime } from "@/lib/date-format";
import { WeeklyCountView } from "@/components/mgr/views/weekly-count";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { TaproomCountSnapshot } from "@/lib/mgr/taproom-count-state";
import { plural } from "@/lib/mgr/plural";
import "@/lib/commands/all";
import { TaproomCountCorrection, TaproomCountForm, TaproomPrintWorksheet, type DraftProjection, type PrintLabel } from "./count-form";

type Location = { id: string; name: string; uses: string[] };
type CountHeader = { id: string; root_id: string; effective_id: string; location_id: string; counted_on: string; observed_at: string; counted_by: string; created_at: string; prior_count_id: string | null; corrected_at: string | null; corrected_by: string | null; correction_reason: string | null; observations: number; movements: number; depleted_units: number };
type ReceiptLine = { id: string; bin_id: string; bin_name: string | null; sku_id: string; sku_name: string | null; lot_id: string | null; qty_before: number; qty_counted: number; movement_id: string | null; bbl: number | null };
type Receipt = CountHeader & { correction_eligible: boolean; lines: ReceiptLine[] };
const key = (binId: string, skuId: string, lotId: string | null) => `${binId}:${skuId}:${lotId ?? "untracked"}`;

export default async function TaproomPage({ searchParams }: { searchParams: Promise<{ location?: string; count?: string }> }) {
  const selected = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_taproom_count_snapshot", "Weekly count");
  const locations = await runCommand("list_locations", { use: "taproom" }, ctx) as Location[];
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <WeeklyCountView model={{ backHref: "/beer", locations: [], location: "", role: brewery.role as "admin" | "warehouse" | "taproom", lotLabels: {}, history: [] }} />;

  const snapshot = await runCommand("get_taproom_count_snapshot", { locationId: location.id }, ctx) as TaproomCountSnapshot;
  const [printLabels, projection, history] = await Promise.all([
    runCommand("get_taproom_print_labels", { locationId: location.id, revision: snapshot.revision }, ctx) as Promise<PrintLabel[]>,
    runCommand("get_taproom_draft_projection", { locationId: location.id }, ctx) as Promise<DraftProjection>,
    runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<CountHeader[]>,
  ]);
  const receipt = selected.count ? await runCommand("get_taproom_count", { countId: selected.count }, ctx) as Receipt : null;
  const shownReceipt = receipt?.location_id === location.id ? receipt : null;
  const lotLabels = Object.fromEntries(printLabels.filter((row) => row.lot_id && row.lot_code).map((row) => [key(row.bin_id, row.sku_id, row.lot_id), row.lot_code!]));

  const role = brewery.role as "admin" | "warehouse" | "taproom";
  return <WeeklyCountView model={{
    backHref: "/beer", boardHref: `/taproom/board?location=${location.id}`, varianceHref: `/taproom/variance?location=${location.id}`,
    locations: locations.map(item => [item.name, `/taproom?location=${item.id}`]), location: location.name, role, lotLabels,
    receipt: shownReceipt ? {
      date: shownReceipt.counted_on, canCorrect: shownReceipt.correction_eligible,
      recorded: `Recorded by ${shownReceipt.counted_by === ctx.userId ? "you" : "staff"} at ${formatDateTime(shownReceipt.created_at)}${shownReceipt.prior_count_id ? "" : " · first count"}`,
      priorHref: shownReceipt.prior_count_id ? `/taproom?location=${location.id}&count=${shownReceipt.prior_count_id}` : undefined,
      correction: shownReceipt.corrected_at ? `Corrected by ${shownReceipt.corrected_by === ctx.userId ? "you" : "Admin"} at ${formatDateTime(shownReceipt.corrected_at)} · ${shownReceipt.correction_reason}` : undefined,
      lines: shownReceipt.lines.map((line, index) => {
        const savedIdentity = line.lot_id
          ? role === "taproom" ? `tracked · saved row ${index + 1}` : `tracked lot ${lotLabels[key(line.bin_id, line.sku_id, line.lot_id)] ?? line.lot_id} · saved row ${index + 1}`
          : `untracked stock · saved row ${index + 1}`;
        return { key: line.id, name: line.sku_name ?? "Saved SKU",
          detail: `${line.bin_name ?? "Saved bin"} · ${savedIdentity} · ${Number(line.qty_before)} recorded, ${Number(line.qty_counted)} counted · ${line.bbl == null ? "0 bbl depleted" : `${Math.abs(Number(line.bbl))} bbl depleted`}`,
          result: line.movement_id ? `movement ${line.movement_id}` : "matched · no movement" };
      }),
    } : undefined,
    history: history.map(count => ({ key: count.id, date: count.counted_on, detail: `${formatDateTime(count.created_at)} · ${plural(count.observations, "observation")} · ${plural(count.movements, "movement")} · ${plural(count.depleted_units, "unit")} depleted${count.corrected_at ? ` · corrected ${formatDateTime(count.corrected_at)} by Admin` : ""}`, href: `/taproom?location=${location.id}&count=${count.id}` })),
  }}
    draft={<TaproomCountForm key={`${location.id}:${snapshot.revision}`} breweryId={brewery.id} snapshot={snapshot} projection={projection} lotLabels={lotLabels} role={role}
      print={<TaproomPrintWorksheet key={`${location.id}:${snapshot.revision}`} breweryId={brewery.id} locationId={location.id} locationName={location.name} revision={snapshot.revision} initialLabels={printLabels} />} />}
    correction={shownReceipt && role === "admin" && shownReceipt.correction_eligible ? <TaproomCountCorrection breweryId={brewery.id} locationId={location.id} countId={shownReceipt.root_id} lines={shownReceipt.lines} /> : null}
  />;
}
