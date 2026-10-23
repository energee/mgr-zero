// app/(app)/compliance/[period]/page.tsx — Monthly compliance (screen record
// Monthly compliance): the TTB period — the segment is a month YYYY-MM, a
// quarter YYYY-Qn, or a year YYYY (lib/compliance-period.ts) — generated from the ledger, or the filed
// snapshot once one exists; a period that starts before the books opened
// explains itself instead (#987). Completion losses remain reviewable through
// append-only category allocations. Saving a snapshot records the filing in
// MGR; it never files with TTB or the state.
import { MonthlyComplianceView, PeriodBeforeBooksView } from "@/components/mgr/views/monthly-compliance";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LossReview, Report } from "@/lib/commands/compliance";
import { beforeBooksState, toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { hasAnyRole } from "@/lib/mgr/roles";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { FileButton } from "./file-button";
import { LossReviewForm } from "./loss-review-form";
import { JURISDICTION, periodLabel, periodOver, periodRange, startsBeforeBooks } from "@/lib/compliance-period";

export default async function PeriodPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const range = periodRange(period);
  if (!range) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings: [filing], today, booksOpenedOn }, losses] = await Promise.all([
    runCommand("list_compliance_reports", { jurisdiction: JURISDICTION, ...range }, ctx) as Promise<{ filings: Filing[]; today: string; booksOpenedOn: string | null }>,
    runCommand("get_loss_review", range, ctx) as Promise<LossReview[]>,
  ]);
  // generate_compliance_report refuses such a period; a filed one still shows its snapshot.
  if (!filing && booksOpenedOn && startsBeforeBooks(period, booksOpenedOn)) {
    return <PeriodBeforeBooksView title={periodLabel(period)} state={beforeBooksState(periodLabel(period), booksOpenedOn, hasAnyRole(brewery.roles, ["admin"]))} backHref="/compliance" />;
  }
  const report: Report = filing ? { figures: filing.figures, warnings: [] } : (await runCommand("generate_compliance_report", { jurisdiction: JURISDICTION, ...range }, ctx)) as Report;
  const model = toMonthlyComplianceViewProps({ monthLabel: periodLabel(period), timeZone: brewery.timeZone, report, filing, losses, backHref: "/compliance" });
  return <MonthlyComplianceView
    model={model}
    lossAction={(loss) => <LossReviewForm loss={loss} />}
    monthOpen={!filing && !periodOver(period, today)}
    fileAction={filing ? undefined : <FileButton jurisdiction={JURISDICTION} {...range} reason={model.fileReason} />}
  />;
}
