import { Fragment, type ReactNode } from "react";
import { DestinationStateExport } from "./destination-state-export";
import { FileSnapshotControl } from "./file-snapshot";
import { E } from "@/components/mgr/e";
import type { LossReview } from "@/lib/commands/compliance";
import type { ComplianceFiguresViewModel, MonthlyComplianceViewModel } from "@/lib/mgr/monthly-compliance-view";
import { formatDateTime } from "@/lib/date-format";

function ComplianceFigures({ model, inProcessDetail, warnings = [] }: { model: ComplianceFiguresViewModel; inProcessDetail: string; warnings?: string[] }) {
  return <>
    {E.tbl(["class", "begin", "+", "−", "end"], model.lines, ["l", "r", "r", "r", "r"])}
    {E.info("Every package class balances: begin + in − out = end, in barrels. Cellar removals are included once in the removal totals below. Zeros print 0.00.")}
    {warnings.map((warning) => <Fragment key={warning}>{E.note(warning)}</Fragment>)}
    {E.row("Beer in process", inProcessDetail, model.inProcess)}
    {E.row("Packaged", "production into finished goods", model.packaged)}
    {model.removals.map((row) => <Fragment key={row.key}>{row.key === "loss" ? E.fld(row.title, row.bbl) : E.row(row.title, "", row.bbl)}</Fragment>)}
    {model.cellarRemovals.length ? <>{E.info("Cellar removals breakdown is explanatory and is already included once in the filing removal totals above. Do not add it again.")}{model.cellarRemovals.map((row) => <Fragment key={row.key}>{E.fld(`${row.title} · non-additive breakdown`, row.bbl)}</Fragment>)}</> : null}
    {E.ttl("Destination-state totals")}
    {model.stateExport ? <>
      {E.tbl(["state", "outward BBL", "returned BBL", "adjustment BBL", "net BBL", "sales", "credits", "net sales"], model.stateRows, ["l", "r", "r", "r", "r", "r", "r", "r"])}
      {E.info("Physical movement and invoiced beer sales have separate event dates. Returns reduce outward volume. Credits reduce beer sales; keg deposits are excluded. Unassigned facts have no recorded destination. Exported facts reconcile to these totals. State taxes and filing forms remain external.")}
      <DestinationStateExport {...model.stateExport} />
    </> : E.info("Supporting destination-state facts were not captured in this snapshot.")}
    {model.byState.map((row) => <Fragment key={row.key}>{E.row(row.title, "gross taxable shipments · before returns", row.bbl)}</Fragment>)}
  </>;
}

export function MonthlyComplianceView({ model, lossAction, fileAction, monthOpen = false }: {
  model: MonthlyComplianceViewModel;
  lossAction?: (loss: LossReview) => ReactNode;
  fileAction?: ReactNode;
  /** The period (month, quarter, or year) has not ended: it can be reviewed, not filed (#429). */
  monthOpen?: boolean;
}) {
  return <>
    {E.back("Compliance", model.title, undefined, model.backHref)}
    {model.amendments?.length ? <section className="grid gap-3 rounded-xl border p-4">
      {E.status("Needs amendment", "w")}
      {E.info("An admin corrected the reporting basis. The original filed snapshot below remains unchanged. Review the recorded corrected figures and file any amended report outside MGR; MGR does not transmit it or clear this history flag.")}
      {model.amendments.map((amendment, index) => <div key={amendment.id} className="grid gap-2">
        {E.ttl(index === 0 ? "Latest recorded correction" : "Earlier recorded correction")}
        <p>{amendment.oldBasis} to {amendment.newBasis} · {amendment.reason}</p>
        <p className="break-words text-sm text-muted-foreground"><time dateTime={amendment.at}>{formatDateTime(amendment.at, model.timeZone)}</time> · Actor {amendment.actor}</p>
        {amendment.invalidPeriod ? E.note("This period starts before the corrected books-opened date. Resolve its external filing with your compliance owner; it cannot be generated under this basis.") : null}
        {!amendment.figures.balances ? E.note("The corrected figures do not balance. Resolve the source records before preparing an amended filing.") : null}
        <ComplianceFigures model={amendment.figures} inProcessDetail="tanks at correction, not at period end" />
      </div>)}
    </section> : null}
    {E.row("1 · Review auto-reconciled losses", "Completion reconciliations stay in history while allocations change their removal category.")}
    {model.losses.length === 0 ? E.info("No generic cellar losses posted in this period.") : model.losses.map((loss) => <section key={loss.key} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{loss.title}</p><p className="text-sm text-muted-foreground">{loss.detail}</p></div>{lossAction ? lossAction(loss.source) : E.btn("Reattribute loss", "g")}</div>
      {loss.allocations.length ? <div className="mt-3 grid gap-2">{loss.allocations.map((allocation) => <Fragment key={allocation.key}>{E.fld(`${allocation.title} · ${allocation.detail}`, allocation.bbl)}</Fragment>)}</div> : null}
    </section>)}
    {model.losses.length ? E.info("An allocation changes removal categories in the period you save it. Earlier filed snapshots stay unchanged.") : null}
    {E.row(model.filingDate ? "2 · Review original filed figures" : "2 · Review generated figures", "", E.status(model.filingDate ? `Filed ${model.filingDate}` : model.balances ? "Current" : "Does not balance", model.filingDate || model.balances ? "ok" : "w"))}
    <ComplianceFigures model={model} warnings={model.warnings} inProcessDetail={model.filingDate ? "tanks at filing, not at period end" : "tanks now, not at period end"} />
    {E.row("3 · Confirm filed outside MGR", "", model.filingDate ? E.status("Done", "ok") : "")}
    {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances.")}
    {monthOpen ? E.status("File once the period ends", "w") : fileAction !== undefined ? fileAction : model.filingDate ? E.status(`Snapshot saved ${model.filingDate}`, "ok") : <>{E.edit("Note · optional", "filed on pay.gov")}<FileSnapshotControl /></>}
  </>;
}
