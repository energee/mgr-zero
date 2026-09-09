// app/(app)/compliance/page.tsx — Compliance months (screen record Compliance
// months): the recent months and every filed period, each with its filing
// state, the registry link, and the lots a trace can start from. Sales and
// Admin.
import { ComplianceMonthsView } from "@/components/mgr/views/compliance-months";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LotRowOut } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toComplianceMonthsViewProps } from "@/lib/mgr/compliance-months-view";
import "@/lib/commands/all";
import { bbl, JURISDICTION, monthLabel, recentMonths } from "./period";

export default async function CompliancePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings, today }, lots] = (await Promise.all([runCommand("list_compliance_reports", {}, ctx), runCommand("list_lots", {}, ctx)])) as [{ filings: Filing[]; today: string }, LotRowOut[]];
  const filed = new Map(filings.filter((f) => f.jurisdiction === JURISDICTION).map((f) => [f.period_start.slice(0, 7), f]));
  const months = [...new Set([...recentMonths(today), ...filed.keys()])].sort().reverse();
  return (
    <ComplianceMonthsView
      model={toComplianceMonthsViewProps({
        months: months.map((m) => {
          const f = filed.get(m);
          return f
            ? { key: m, title: monthLabel(m), detail: `filed ${f.filed_at?.slice(0, 10)} · ${bbl(f.figures.removals.taxable ?? 0)} bbl taxable`, tone: "ok" as const, href: `/compliance/${m}` }
            : { key: m, title: monthLabel(m), detail: "not filed · ready to review", tone: "w" as const, href: `/compliance/${m}` };
        }),
        registry: { key: "registry", title: "Compliance registry", detail: "brands, states and licenses", href: "/compliance/registry" },
        lots: lots.map((l) => ({ key: l.id, title: l.code, detail: `${l.brands?.name ?? ""} · packaged ${l.packaged_on}`, href: `/compliance/lots/${l.id}` })),
      })}
      linkRows
    />
  );
}
