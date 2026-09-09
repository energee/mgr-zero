// app/(app)/compliance/[month]/page.tsx — Monthly compliance (screen record
// Monthly compliance): the TTB month generated from the ledger, or the filed
// snapshot once one exists. Completion losses remain reviewable through
// append-only category allocations. MGR saves snapshots but never transmits a filing.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LossReview, Report, ReportLine } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { treatmentLabel } from "@/app/(app)/settings/channels/tax-treatments";
import { FileButton } from "./file-button";
import { LossReviewForm } from "./loss-review-form";
import { bbl, JURISDICTION, monthLabel, monthRange } from "../period";

// removals are keyed by tax treatment for sales and depletions and by movement type otherwise; unknown keys fall back to the enum's own label
const REMOVAL_LABEL: Record<string, string> = {
  taxable: "Taxpaid removals", export: "Export", vessel_supplies: "Supplies for vessels", research: "Research", transfer_in_bond: "Transferred in bond",
  destruction: "Destroyed", loss: "Losses", sample: "Samples", festival_removal: "Festival removals",
};
const CLASS_LABEL: Record<ReportLine["class"], string> = { keg: "kegs", can: "cans", bottle: "bottles" };

export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const range = monthRange(month);
  if (!range) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings: [filing] }, losses] = await Promise.all([
    runCommand("list_compliance_reports", { jurisdiction: JURISDICTION, ...range }, ctx) as Promise<{ filings: Filing[] }>,
    runCommand("get_loss_review", range, ctx) as Promise<LossReview[]>,
  ]);
  const report: Report = filing ? { figures: filing.figures, warnings: [], externalMappingRequired: [] } : (await runCommand("generate_compliance_report", { jurisdiction: JURISDICTION, ...range }, ctx)) as Report;
  const { figures } = report;
  return (
    <>
      {E.back("Compliance months", monthLabel(month), undefined, "/compliance")}
      {E.row("1 · Review auto-reconciled losses", "Completion reconciliations stay in history while allocations change their removal category.")}
      {losses.length === 0 ? E.info("No completion reconciliation losses posted in this period.") : losses.map((loss) => <section key={loss.adjustment_id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">Batch {loss.batch_no}</p>
            <p className="text-sm text-muted-foreground">Original generic loss {loss.original_bbl} bbl · remaining {loss.remaining_bbl} bbl</p>
          </div>
          <LossReviewForm loss={loss} />
        </div>
        {loss.allocations.length > 0 && <div className="mt-3 grid gap-2">
          {loss.allocations.map((allocation) => <div key={allocation.id}>{E.row(`${allocation.classification[0].toUpperCase()}${allocation.classification.slice(1)}`, allocation.destination_state ? `Destination ${allocation.destination_state}` : allocation.tax_treatment ? `Frozen ${treatmentLabel(allocation.tax_treatment)}` : "Prior allocation", `${allocation.bbl} bbl`)}</div>)}
        </div>}
      </section>)}
      {losses.length > 0 && E.info("An allocation changes removal categories in the period you save it. Earlier filed snapshots stay unchanged.")}
      {E.row("2 · Review generated figures", "", filing ? E.status(`Filed ${filing.filed_at?.slice(0, 10)}`, "ok") : E.status(figures.balances ? "Current" : "Does not balance", figures.balances ? "ok" : "w"))}
      {E.tbl(["class", "begin", "+", "−", "end"], figures.lines.map((l) => [CLASS_LABEL[l.class], bbl(l.begin), bbl(l.in), bbl(l.out), bbl(l.end)]))}
      {E.info("Every package class balances: begin + in − out = end, in barrels. Cellar removals are included once in the removal totals below. Zeros print 0.00.")}
      {report.warnings.map((w) => <div key={w}>{E.note(w)}</div>)}
      {E.row("Beer in process", "tanks now, not at period end", `${bbl(figures.inProcess)} bbl`)}
      {E.row("Packaged", "production into finished goods", `${bbl(figures.packaged)} bbl`)}
      {Object.entries(figures.removals).map(([k, v]) => <div key={k}>{E.row(REMOVAL_LABEL[k] ?? treatmentLabel(k), "", `${bbl(v)} bbl`)}</div>)}
      {Object.keys(figures.cellarRemovals ?? {}).length > 0 && <>
        {E.info("Cellar removals breakdown is explanatory and is already included once in the filing removal totals above. Do not add it again.")}
        {Object.entries(figures.cellarRemovals ?? {}).map(([k, v]) => <div key={k}>{E.row(`Cellar · ${REMOVAL_LABEL[k] ?? k}`, "non-additive breakdown", `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 8 })} bbl`)}</div>)}
      </>}
      {Object.entries(figures.byState).map(([s, v]) => <div key={s}>{E.row(`Taxpaid to ${s}`, "destination state", `${bbl(v)} bbl`)}</div>)}
      {E.row("3 · Confirm filed outside MGR", "", filing ? E.status("Done", "ok") : "")}
      {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances and required external mappings are approved.")}
      {filing ? E.status(`Snapshot saved ${filing.filed_at?.slice(0, 10)}`, "ok") : <FileButton jurisdiction={JURISDICTION} {...range} balances={figures.balances} externalMappingRequired={report.externalMappingRequired} />}
    </>
  );
}
