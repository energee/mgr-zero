"use client";

import { ReportingBasisView } from "@/components/mgr/views/reporting-basis";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ReportingBasisCorrection } from "@/lib/commands/compliance";
import { toast } from "sonner";

export function ReportingBasisForm({ basis, history, timeZone }: { basis: string | null; history: ReportingBasisCorrection[]; timeZone: string }) {
  const action = useCommandAction("reporting-basis");
  return <ReportingBasisView basis={basis} history={history} timeZone={timeZone} busy={action.busy} error={action.error} locked={action.blocked}
    onCorrect={input => { void action.run("correct_reporting_basis", input, () => toast.success("Reporting basis corrected. Review flagged periods in Compliance.")); }}
    onRetry={action.pending ? () => { void action.run(action.pending!.name, action.pending!.input, () => toast.success("Reporting basis correction recovered.")); } : undefined}
  />;
}
