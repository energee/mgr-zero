// app/(app)/compliance/[month]/page.tsx — Monthly compliance (screen record
// Monthly compliance): the TTB month generated from the ledger, or the filed
// snapshot once one exists. Completion losses remain reviewable through
// append-only category allocations. MGR saves snapshots but never transmits a filing.
import { MonthlyComplianceView } from "@/components/mgr/views/monthly-compliance";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LossReview, Report } from "@/lib/commands/compliance";
import { toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { FileButton } from "./file-button";
import { LossReviewForm } from "./loss-review-form";
import { JURISDICTION, monthLabel, monthRange } from "../period";

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
  return <MonthlyComplianceView
    model={toMonthlyComplianceViewProps({ monthLabel: monthLabel(month), report, filing, losses, backHref: "/compliance" })}
    lossAction={(loss) => <LossReviewForm loss={loss} />}
    fileAction={filing ? undefined : <FileButton jurisdiction={JURISDICTION} {...range} balances={report.figures.balances} externalMappingRequired={report.externalMappingRequired} />}
  />;
}
