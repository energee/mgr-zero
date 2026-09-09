import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { LossReview } from "@/lib/commands/compliance";
import type { MonthlyComplianceViewModel } from "@/lib/mgr/monthly-compliance-view";

export function MonthlyComplianceView({ model, lossAction, fileAction }: {
  model: MonthlyComplianceViewModel;
  lossAction?: (loss: LossReview) => ReactNode;
  fileAction?: ReactNode;
}) {
  return <>
    {E.back("Compliance months", model.title, undefined, model.backHref)}
    {E.row("1 · Review auto-reconciled losses", "Completion reconciliations stay in history while allocations change their removal category.")}
    {model.losses.length === 0 ? E.info("No completion reconciliation losses posted in this period.") : model.losses.map((loss) => <section key={loss.key} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{loss.title}</p><p className="text-sm text-muted-foreground">{loss.detail}</p></div>{lossAction ? lossAction(loss.source) : E.btn("Reattribute loss", "g")}</div>
      {loss.allocations.length ? <div className="mt-3 grid gap-2">{loss.allocations.map((allocation) => <Fragment key={allocation.key}>{E.fld(`${allocation.title} · ${allocation.detail}`, allocation.bbl)}</Fragment>)}</div> : null}
    </section>)}
    {model.losses.length ? E.info("An allocation changes removal categories in the period you save it. Earlier filed snapshots stay unchanged.") : null}
    {E.row("2 · Review generated figures", "", E.status(model.filingDate ? `Filed ${model.filingDate}` : model.balances ? "Current" : "Does not balance", model.filingDate || model.balances ? "ok" : "w"))}
    {E.tbl(["class", "begin", "+", "−", "end"], model.lines)}
    {E.info("Every package class balances: begin + in − out = end, in barrels. Cellar removals are included once in the removal totals below. Zeros print 0.00.")}
    {model.warnings.map((warning) => <Fragment key={warning}>{E.note(warning)}</Fragment>)}
    {E.row("Beer in process", "tanks now, not at period end", model.inProcess)}
    {E.row("Packaged", "production into finished goods", model.packaged)}
    {model.removals.map((row) => <Fragment key={row.key}>{row.key === "loss" ? E.fld(row.title, row.bbl) : E.row(row.title, "", row.bbl)}</Fragment>)}
    {model.cellarRemovals.length ? <>{E.info("Cellar removals breakdown is explanatory and is already included once in the filing removal totals above. Do not add it again.")}{model.cellarRemovals.map((row) => <Fragment key={row.key}>{E.fld(`${row.title} · non-additive breakdown`, row.bbl)}</Fragment>)}</> : null}
    {model.byState.map((row) => <Fragment key={row.key}>{E.row(row.title, "destination state", row.bbl)}</Fragment>)}
    {E.row("3 · Confirm filed outside MGR", "", model.filingDate ? E.status("Done", "ok") : "")}
    {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances and required external mappings are approved.")}
    {fileAction !== undefined ? fileAction : model.filingDate ? E.status(`Snapshot saved ${model.filingDate}`, "ok") : <>{E.edit("Note · optional", "filed on pay.gov")}{E.btn("Save filed snapshot", "irr")}</>}
  </>;
}
