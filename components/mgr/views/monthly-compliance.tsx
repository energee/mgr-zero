import { Fragment, type ReactNode } from "react";
import { DestinationStateExport } from "./destination-state-export";
import { FileSnapshotForm } from "./file-snapshot";
import { E } from "@/components/mgr/e";
import type { LossReview } from "@/lib/commands/compliance";
import type { BeforeBooksState, ComplianceFiguresViewModel, MonthlyComplianceViewModel } from "@/lib/mgr/monthly-compliance-view";
import { formatDateTime } from "@/lib/date-format";

function ComplianceFigures({ model, inProcessDetail, warnings = [] }: { model: ComplianceFiguresViewModel; inProcessDetail: string; warnings?: string[] }) {
  return <>
    {/* Unsorted, here and in the state totals: rows follow the TTB report's
        order, and staff copy them row by row onto the form. */}
    {E.tbl(["Class", "Begin", "In", "Out", "End"], model.lines, ["l", "r", "r", "r", "r"], { sortable: false })}
    {E.info("Every package class balances: Begin + In − Out = End, in barrels. Cellar removals are included once in the removal totals below. Zeros print 0.00.")}
    {warnings.map((warning) => <Fragment key={warning}>{E.note(warning)}</Fragment>)}
    {E.row("Beer in process", model.inProcessAsOf ? `Shows beer remaining in tanks at the end of ${model.inProcessAsOf}, in the brewery's time zone.` : inProcessDetail, model.inProcess)}
    {E.row("Packaged", "Shows production added to finished goods.", model.packaged)}
    {model.removals.map((row) => <Fragment key={row.key}>{row.key === "loss" ? E.fld(row.title, row.bbl) : E.row(row.title, "", row.bbl)}</Fragment>)}
    {model.cellarRemovals.length ? <>{E.info("Cellar removals breakdown is explanatory and is already included once in the filing removal totals above. Do not add it again.")}{model.cellarRemovals.map((row) => <Fragment key={row.key}>{E.fld(`${row.title} · already counted above`, row.bbl)}</Fragment>)}</> : null}
    {E.ttl("Destination-state totals")}
    {model.stateExport ? <>
      {E.tbl(["State", "Removed (bbl)", "Returned (bbl)", "Adjustments (bbl)", "Net (bbl)", "Sales", "Credits", "Net sales"], model.stateRows, ["l", "r", "r", "r", "r", "r", "r", "r"], { sortable: false })}
      {E.info("Beer moves and beer sales count on their own dates. Net (bbl) is Removed less Returned, plus signed Adjustments. Net sales is Sales less Credits; keg deposits are excluded. The Unassigned row holds transactions with no recorded destination: shipments, returns, adjustments, invoices, or credits. These totals match the exported transactions. State taxes and state filing forms are done outside MGR.")}
      <DestinationStateExport {...model.stateExport} />
    </> : E.info("This snapshot was saved without the transactions behind its destination-state totals.")}
    {model.byState.map((row) => <Fragment key={row.key}>{E.row(row.title, "Shows gross taxable shipments before returns.", row.bbl)}</Fragment>)}
  </>;
}

export function MonthlyComplianceView({ model, lossAction, fileAction }: {
  model: MonthlyComplianceViewModel;
  lossAction?: (loss: LossReview) => ReactNode;
  /** The live Save (FileButton). Absent in the inventory, which draws the inert form; null draws none. */
  fileAction?: ReactNode;
}) {
  // Step 3, one case at a time: already filed, not yet ended, the live Save, or the inventory's.
  const record = model.filingDate ? E.status(`Snapshot saved ${model.filingDate}`, "ok")
    : model.periodStatus !== "Past" ? E.status(`You can record the filing after ${model.title} ends`, "w")
    : fileAction !== undefined ? fileAction
    : <FileSnapshotForm reason={model.fileReason} />;
  return <>
    {E.back("Compliance", model.title, E.status(model.periodStatus, model.periodStatus === "Current" ? "ok" : ""), model.backHref)}
    {model.periodStatus === "Upcoming" ? E.info(`This period has not started. It starts on ${model.periodStart}. You can record the filing only after it ends.`) : null}
    {model.amendments?.length ? <section className="grid gap-3 rounded-xl border p-4">
      {E.status("Needs amendment", "w")}
      {E.info("An admin corrected the reporting basis. The original filed snapshot below remains unchanged. Review the recorded corrected figures and file any amended report outside MGR. MGR does not send it or clear this history flag.")}
      {model.amendments.map((amendment, index) => <div key={amendment.id} className="grid gap-2">
        {E.ttl(index === 0 ? "Latest recorded correction" : "Earlier recorded correction")}
        <p>{amendment.oldBasis} to {amendment.newBasis} · {amendment.reason}</p>
        <p className="break-words text-sm text-muted-foreground"><time dateTime={amendment.at}>{formatDateTime(amendment.at, model.timeZone)}</time> · Actor {amendment.actor}</p>
        {amendment.invalidPeriod ? E.note("This period starts before the corrected books-opened date. Resolve its external filing with your compliance owner; it cannot be generated under this basis.") : null}
        {!amendment.figures.balances ? E.note("The corrected figures do not balance. Resolve the source records before preparing an amended filing.") : null}
        <ComplianceFigures model={amendment.figures} inProcessDetail="Shows what was in tanks at correction, not at the end of the period." />
      </div>)}
    </section> : null}
    {E.row("1 · Review cellar losses", "Losses recorded when a batch completed or a transfer came up short. Reattribute part of one to samples, the taproom, or destruction; the original stays in history.")}
    {model.losses.length === 0 ? E.info("No cellar losses were recorded in this period.") : model.losses.map((loss) => <section key={loss.key} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{loss.title}</p><p className="text-sm text-muted-foreground">{loss.detail}</p></div>{lossAction ? lossAction(loss.source) : E.btn("Reattribute loss", "g")}</div>
      {loss.allocations.length ? <div className="mt-3 grid gap-2">{loss.allocations.map((allocation) => <Fragment key={allocation.key}>{E.fld(`${allocation.title} · ${allocation.detail}`, allocation.bbl)}</Fragment>)}</div> : null}
    </section>)}
    {model.losses.length ? E.info("A reattribution counts in the period you save it. Earlier filed snapshots stay unchanged.") : null}
    {E.row(model.filingDate ? "2 · Review original filed figures" : "2 · Review generated figures", "", E.status(model.filingDate ? `Filed ${model.filingDate}` : model.balances ? "Live figures" : "Does not balance", model.balances ? "" : "w"))}
    {!model.filingDate ? E.info("Live figures are generated from the ledger now, not a saved filing. Past periods can change when transactions are recorded or corrected; a filed snapshot stays unchanged.") : null}
    <ComplianceFigures model={model} warnings={model.warnings} inProcessDetail={model.filingDate ? "Shows what was in tanks at filing, not at the end of the period." : "Shows what's in tanks now, not at the end of the period."} />
    {E.row("3 · Record the filing", "", model.filingDate ? E.status("Done", "ok") : "")}
    {E.info(model.filingDate
      ? "MGR does not file with TTB or the state. This snapshot records the figures as filed."
      : "MGR does not file with TTB or the state. File your report there yourself, for example on Pay.gov, then record the filing here. The saved snapshot keeps these figures as filed.")}
    {record}
  </>;
}

/** A period that starts before the books opened: no report exists, so the page says why (#987).
 *  The state's action (Open Settings) is present for an admin only. */
export function PeriodBeforeBooksView({ title, state, backHref }: { title: string; state: BeforeBooksState; backHref?: string }) {
  return <>
    {E.back("Compliance", title, undefined, backHref)}
    {E.blank(state, undefined, state.action && E.btn(state.action.label, "p", state.action.href))}
  </>;
}
