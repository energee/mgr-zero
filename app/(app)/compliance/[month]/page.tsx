// app/(app)/compliance/[month]/page.tsx — Monthly compliance (screen record
// Monthly compliance): the TTB month generated from the ledger, or the filed
// snapshot once one exists. Per package class begin + in − out = end in bbl,
// removals by tax treatment and taxable removals by destination state, beer
// in process, then Save filed snapshot. Loss review stays gated. MGR never
// transmits a filing.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, Report } from "@/lib/commands/compliance";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { FileButton } from "./file-button";
import { bbl, JURISDICTION, monthLabel, monthRange } from "../period";

const REMOVAL_LABEL: Record<string, string> = {
  taxable: "Taxpaid removals", export: "Export", vessel_supplies: "Supplies for vessels", research: "Research", transfer_in_bond: "Transferred in bond",
  destruction: "Destroyed", loss: "Losses", sample: "Samples", festival_removal: "Festival removals",
};

export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const range = monthRange(month);
  if (!range) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { filings } = (await runCommand("list_compliance_reports", {}, ctx)) as { filings: Filing[] };
  const filing = filings.find((f) => f.jurisdiction === JURISDICTION && f.period_start === range.periodStart && f.period_end === range.periodEnd);
  const report = filing ? { figures: filing.figures, warnings: [] } : (await runCommand("generate_compliance_report", { jurisdiction: JURISDICTION, ...range }, ctx)) as Report;
  const { figures } = report;
  return (
    <>
      {E.back("Compliance months", monthLabel(month), undefined, "/compliance")}
      {E.gated("1 · Review auto-reconciled losses", "review isn’t available yet")}
      {E.row("2 · Review generated figures", "", filing ? E.status(`Filed ${filing.filed_at?.slice(0, 10)}`, "ok") : E.status(figures.balances ? "Current" : "Does not balance", figures.balances ? "ok" : "w"))}
      {E.tbl(["class", "begin", "+", "−", "end"], figures.lines.map((l) => [l.class === "can" ? "cans" : l.class === "keg" ? "kegs" : "bottles", bbl(l.begin), bbl(l.in), bbl(l.out), bbl(l.end)]))}
      {E.info("Every class balances: begin + in − out = end, in barrels. Cellar leaves by packaging, not as a removal. Zeros print 0.00.")}
      {report.warnings.map((w) => <div key={w}>{E.note(w)}</div>)}
      {E.row("Beer in process", "tanks now, not at period end", `${bbl(figures.inProcess)} bbl`)}
      {E.row("Packaged", "production into finished goods", `${bbl(figures.packaged)} bbl`)}
      {Object.entries(figures.removals).map(([k, v]) => <div key={k}>{E.row(REMOVAL_LABEL[k] ?? k, "", `${bbl(v)} bbl`)}</div>)}
      {Object.entries(figures.byState).map(([s, v]) => <div key={s}>{E.row(`Taxpaid to ${s}`, "destination state", `${bbl(v)} bbl`)}</div>)}
      {E.row("3 · Confirm filed outside MGR", "", filing ? E.status("Done", "ok") : "")}
      {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances.")}
      {filing ? E.status(`Snapshot saved ${filing.filed_at?.slice(0, 10)}`, "ok") : <FileButton jurisdiction={JURISDICTION} {...range} balances={figures.balances} />}
    </>
  );
}
