import { formatDate, formatDateTime, formatTimeOfDay } from "@/lib/date-format";
import { WeeklyCountView } from "@/components/mgr/views/weekly-count";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission, runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { countOutcome, savedLineDetail, type TaproomCountSnapshot } from "@/lib/mgr/taproom-count-state";
import { varianceReason } from "@/lib/mgr/taproom-variance-view";
import type { TaproomLineMovementType } from "@/lib/supabase/rpc-results";
import "@/lib/commands/all";
import { TaproomCountCorrection, TaproomCountForm, TaproomPrintWorksheet, type DraftProjection, type PrintLabel } from "./count-form";
import { hasAnyRole, onlyRoles } from "@/lib/mgr/roles";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/taproom") };

type Location = { id: string; name: string; uses: string[] };
type CountHeader = { id: string; root_id: string; effective_id: string; location_id: string; counted_on: string; observed_at: string; counted_by: string; created_at: string; prior_count_id: string | null; corrected_at: string | null; corrected_by: string | null; correction_reason: string | null; observations: number; movements: number; depleted_units: number; destroyed_units: number };
type ReceiptLine = { id: string; bin_id: string; bin_name: string | null; sku_id: string; sku_name: string | null; lot_id: string | null; lot_code: string | null; qty_before: number; qty_counted: number; movement_id: string | null; bbl: number | null; movement_type: TaproomLineMovementType };
type Receipt = CountHeader & { correction_eligible: boolean; lines: ReceiptLine[] };
const key = (binId: string, skuId: string, lotId: string | null) => `${binId}:${skuId}:${lotId ?? "untracked"}`;

export default async function TaproomPage({ searchParams }: { searchParams: Promise<{ location?: string; count?: string }> }) {
  const selected = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "get_taproom_count_snapshot", "Weekly count");
  const locations = await runCommand("list_locations", { use: "taproom" }, ctx) as Location[];
  const location = locations.find((item) => item.id === selected.location) ?? locations[0];
  if (!location) return <WeeklyCountView model={{ backHref: "/beer", locations: [], location: "", roles: brewery.roles, lotLabels: {}, history: [], timeZone: brewery.timeZone }} />;

  // Only the print labels need the snapshot's revision; the other reads go alongside the pair.
  const snapshotWithLabels = async () => {
    const snapshot = await runCommand("get_taproom_count_snapshot", { locationId: location.id }, ctx) as TaproomCountSnapshot;
    const printLabels = await runCommand("get_taproom_print_labels", { locationId: location.id, revision: snapshot.revision }, ctx) as PrintLabel[];
    return { snapshot, printLabels };
  };
  const loadDraft = () => Promise.all([snapshotWithLabels(), runCommand("get_taproom_draft_projection", { locationId: location.id }, ctx) as Promise<DraftProjection>]);
  // A saved count draws no worksheet, so it skips the worksheet's three reads.
  const [history, receipt, eagerDraft] = await Promise.all([
    runCommand("list_taproom_counts", { locationId: location.id }, ctx) as Promise<CountHeader[]>,
    selected.count ? runCommand("get_taproom_count", { countId: selected.count }, ctx) as Promise<Receipt> : null,
    selected.count ? null : loadDraft(),
  ]);
  const shownReceipt = receipt?.location_id === location.id ? receipt : null;
  // A count id from another taproom shows the worksheet instead, so it loads then.
  const draft = shownReceipt ? null : eagerDraft ?? await loadDraft();
  const lotLabels = Object.fromEntries((draft?.[0].printLabels ?? []).filter((row) => row.lot_id && row.lot_code).map((row) => [key(row.bin_id, row.sku_id, row.lot_id), row.lot_code!]));

  const roles = brewery.roles;
  // A saved line names its bin only when the count covered more than one.
  const receiptBins = new Set(shownReceipt?.lines.map(line => line.bin_id)).size;
  return <WeeklyCountView model={{
    backHref: "/beer", boardHref: `/taproom/board?location=${location.id}`, varianceHref: `/taproom/variance?location=${location.id}`, worksheetHref: `/taproom?location=${location.id}`,
    locations: locations.map(item => ({ value: item.id, label: item.name, href: `/taproom?location=${item.id}` })), location: location.id, roles, lotLabels, timeZone: brewery.timeZone,
    receipt: shownReceipt ? {
      date: formatDate(shownReceipt.counted_on), canCorrect: shownReceipt.correction_eligible,
      recorded: `Recorded by ${shownReceipt.counted_by === ctx.userId ? "you" : "staff"} at ${formatDateTime(shownReceipt.created_at, brewery.timeZone)}${shownReceipt.prior_count_id ? "" : `. ${varianceReason("missing_baseline")}.`}`,
      priorHref: shownReceipt.prior_count_id ? `/taproom?location=${location.id}&count=${shownReceipt.prior_count_id}#saved-count` : undefined,
      correction: shownReceipt.corrected_at ? `Corrected by ${shownReceipt.corrected_by === ctx.userId ? "you" : "Admin"} at ${formatDateTime(shownReceipt.corrected_at, brewery.timeZone)} · ${shownReceipt.correction_reason}` : undefined,
      lines: shownReceipt.lines.map((line, index) => {
        const disposition = line.movement_type === "destruction" ? "destroyed" : "depleted";
        return { key: line.id, name: line.sku_name ?? "Saved SKU",
          detail: savedLineDetail(line, index + 1, { showBin: receiptBins > 1, showLotCode: !onlyRoles(roles, ["taproom"]) }),
          recorded: Number(line.qty_before), counted: Number(line.qty_counted),
          result: line.movement_id ? `${Math.abs(Number(line.bbl))} bbl ${disposition}` : "Matched" };
      }),
    } : undefined,
    history: history.map(count => ({ key: count.id, date: formatDate(count.counted_on), detail: `${formatTimeOfDay(count.created_at, brewery.timeZone)} · ${countOutcome(count)}${count.corrected_at ? ` · corrected ${formatDateTime(count.corrected_at, brewery.timeZone)} by Admin` : ""}`,
      // The saved count draws above this list, so the link lands on it.
      href: `/taproom?location=${location.id}&count=${count.id}#saved-count` })),
  }}
    draft={draft && <TaproomCountForm key={`${location.id}:${draft[0].snapshot.revision}`} breweryId={brewery.id} snapshot={draft[0].snapshot} projection={draft[1]} lotLabels={lotLabels} roles={roles} timeZone={brewery.timeZone}
      print={<TaproomPrintWorksheet key={`${location.id}:${draft[0].snapshot.revision}`} breweryId={brewery.id} locationId={location.id} locationName={location.name} revision={draft[0].snapshot.revision} initialLabels={draft[0].printLabels} />} />}
    correction={shownReceipt && hasAnyRole(roles, ["admin"]) && shownReceipt.correction_eligible ? <TaproomCountCorrection breweryId={brewery.id} locationId={location.id} countId={shownReceipt.root_id} lines={shownReceipt.lines} /> : null}
  />;
}
