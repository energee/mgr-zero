// app/(app)/kegs/report/page.tsx — Keg report (screen record Keg report):
// fleet utilization and FIFO aging of unreturned kegs from get_keg_report,
// each customer row opening Customer keg balance. Warehouse and Admin.
import { KegReportView } from "@/components/mgr/views/keg-report";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toKegReportViewProps, type KegReport } from "@/lib/mgr/keg-report-view";
import "@/lib/commands/all";

export default async function KegReportPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const report = (await runCommand("get_keg_report", {}, ctx)) as KegReport;
  return <KegReportView model={toKegReportViewProps(report, "/kegs")} />;
}
