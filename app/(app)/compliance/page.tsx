// app/(app)/compliance/page.tsx — Compliance months (screen record Compliance
// months): ?cadence=month|quarter|year picks the tab; the recent periods of
// that cadence and every filed one, each with its filing state, the registry
// link, and the lots a trace can start from. Sales and Admin.
import { ComplianceMonthsView } from "@/components/mgr/views/compliance-months";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LotRowOut } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { bblFixed } from "@/lib/volume";
import { cadenceOf, JURISDICTION, periodKey, periodLabel, periodOver, recentPeriods, type Cadence } from "@/lib/compliance-period";
import { noPeriodsYet } from "@/lib/mgr/compliance-months-view";

const CADENCES: [Cadence, string][] = [["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Annual"]];

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ cadence?: string }> }) {
  const { cadence: asked } = await searchParams;
  const on = Math.max(0, CADENCES.findIndex(([c]) => c === asked));
  const cadence = CADENCES[on][0];
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings, today, booksOpenedOn }, lots] = (await Promise.all([runCommand("list_compliance_reports", {}, ctx), runCommand("list_lots", {}, ctx)])) as [{ filings: Filing[]; today: string; booksOpenedOn: string | null }, LotRowOut[]];
  const filed = new Map(filings.filter((f) => f.jurisdiction === JURISDICTION).flatMap((f) => {
    const key = periodKey(f.period_start, f.period_end);
    return key && cadenceOf(key) === cadence ? [[key, f] as const] : [];
  }));
  // A filing row whose filed_at is unset still reads as filed; only its day is unknown.
  const filedLabel = (f: Filing) => f.filed_at ? `filed ${formatDate(f.filed_at, brewery.timeZone)}` : "filed";
  const months = [...new Set([...recentPeriods(today, cadence, booksOpenedOn), ...filed.keys()])].sort().reverse();
  return (
    <ComplianceMonthsView
      model={{
        cadences: CADENCES.map(([, name]) => name),
        cadence: on,
        months: months.map((m) => {
          const f = filed.get(m);
          return f
            ? { key: m, title: periodLabel(m), detail: f.needs_amendment ? `needs amendment · ${filedLabel(f)}` : `${filedLabel(f)} · ${bblFixed(f.figures.removals.taxable ?? 0)} taxable`, tone: f.needs_amendment ? "w" as const : "ok" as const, href: `/compliance/${m}` }
            : { key: m, title: periodLabel(m), detail: periodOver(m, today) ? "not filed · ready to review" : `in progress · file once the ${cadence} ends`, tone: "w" as const, href: `/compliance/${m}` };
        }),
        empty: booksOpenedOn ? noPeriodsYet(cadence, booksOpenedOn) : undefined,
        registry: { key: "registry", title: "Licenses", detail: "the brewery’s state licenses", href: "/compliance/licenses" },
        lots: lots.map((l) => ({ key: l.id, title: l.code, detail: `${l.brands?.name ?? ""} · packaged ${formatDate(l.packaged_on)}`, href: `/compliance/lots/${l.id}` })),
      }}
      linkRows
      cadenceHrefs={Object.fromEntries(CADENCES.map(([c, name]) => [name, `/compliance?cadence=${c}`]))}
    />
  );
}
