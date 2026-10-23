// app/(app)/compliance/page.tsx — Compliance months (screen record Compliance
// months): ?cadence=month|quarter|year picks the tab; the recent periods of
// that cadence and every filed one, each with its filing state (periodRow;
// activePeriods tells an empty ended period from one to review), the
// Licenses link, and the lots a trace can start from. Sales and Admin.
import { ComplianceMonthsView } from "@/components/mgr/views/compliance-months";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LotRowOut } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { cadenceOf, JURISDICTION, periodKey, recentPeriods, type Cadence } from "@/lib/compliance-period";
import { noPeriodsYet, periodRow } from "@/lib/mgr/compliance-months-view";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/compliance") };

const CADENCES: [Cadence, string][] = [["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Annual"]];

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ cadence?: string }> }) {
  const { cadence: asked } = await searchParams;
  const on = Math.max(0, CADENCES.findIndex(([c]) => c === asked));
  const cadence = CADENCES[on][0];
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings, today, booksOpenedOn, activePeriods }, lots] = (await Promise.all([runCommand("list_compliance_reports", {}, ctx), runCommand("list_lots", {}, ctx)])) as [{ filings: Filing[]; today: string; booksOpenedOn: string | null; activePeriods: string[] }, LotRowOut[]];
  const filed = new Map(filings.filter((f) => f.jurisdiction === JURISDICTION).flatMap((f) => {
    const key = periodKey(f.period_start, f.period_end);
    return key && cadenceOf(key) === cadence ? [[key, f] as const] : [];
  }));
  const months = [...new Set([...recentPeriods(today, cadence, booksOpenedOn), ...filed.keys()])].sort().reverse();
  return (
    <ComplianceMonthsView
      model={{
        cadences: CADENCES.map(([, name]) => name),
        cadence: on,
        months: months.map((m) => ({ ...periodRow(m, filed.get(m), today, brewery.timeZone, activePeriods.includes(m)), href: `/compliance/${m}` })),
        empty: booksOpenedOn ? noPeriodsYet(cadence, booksOpenedOn) : undefined,
        registry: { key: "registry", title: "Licenses", detail: "the brewery’s state licenses", href: "/compliance/licenses" },
        lots: lots.map((l) => ({ key: l.id, title: l.code, detail: `${l.brands?.name ?? ""} · packaged ${formatDate(l.packaged_on)}`, href: `/compliance/lots/${l.id}` })),
      }}
      linkRows
      cadenceHrefs={Object.fromEntries(CADENCES.map(([c, name]) => [name, `/compliance?cadence=${c}`]))}
    />
  );
}
