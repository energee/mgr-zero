// app/(app)/compliance/page.tsx — Compliance months (screen record Compliance
// months): ?cadence=month|quarter|year picks the tab; the recent periods of
// that cadence and every filed one, each with its filing state (periodRow;
// list_compliance_active_periods tells an empty ended period from one to review), the
// Licenses link, and a lot-code search (?q=, list_lots) whose matches each
// start a trace; no lot is listed before a search (#1510). Sales and Admin.
import { z } from "zod";
import { ListControls } from "@/components/mgr/list-controls";
import { ComplianceMonthsView } from "@/components/mgr/views/compliance-months";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LotRowOut } from "@/lib/commands/compliance";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { cadenceOf, JURISDICTION, periodKey, recentPeriods, type Cadence } from "@/lib/compliance-period";
import { noLotMatch, noPeriodsYet, periodRow } from "@/lib/mgr/compliance-months-view";
import { listParams } from "@/lib/mgr/list-params";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/compliance") };

const CADENCES: [Cadence, string][] = [["month", "Monthly"], ["quarter", "Quarterly"], ["year", "Annual"]];
const complianceParams = z.object({ cadence: z.string().catch(""), q: z.string().trim().max(100).catch("") });

export default async function CompliancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { params: { cadence: asked, q } } = listParams(complianceParams, await searchParams);
  const on = Math.max(0, CADENCES.findIndex(([c]) => c === asked));
  const cadence = CADENCES[on][0];
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings, today, booksOpenedOn }, activePeriods, lots] = (await Promise.all([
    runCommand("list_compliance_reports", {}, ctx),
    runCommand("list_compliance_active_periods", {}, ctx),
    q ? runCommand("list_lots", { q }, ctx) : [],
  ])) as [{ filings: Filing[]; today: string; booksOpenedOn: string | null }, string[], LotRowOut[]];
  const filed = new Map(filings.filter((f) => f.jurisdiction === JURISDICTION).flatMap((f) => {
    const key = periodKey(f.period_start, f.period_end);
    return key && cadenceOf(key) === cadence ? [[key, f] as const] : [];
  }));
  const months = [...new Set([...recentPeriods(today, cadence, booksOpenedOn), ...filed.keys()])].sort().reverse();
  return (
    <ComplianceMonthsView
      model={{
        backHref: "/more",
        cadences: CADENCES.map(([, name]) => name),
        cadence: on,
        months: months.map((m) => ({ ...periodRow(m, filed.get(m), today, brewery.timeZone, activePeriods.includes(m)), href: `/compliance/${m}` })),
        empty: booksOpenedOn ? noPeriodsYet(cadence, booksOpenedOn, today) : undefined,
        registry: { key: "registry", title: "Licenses", detail: "Your brewery’s state licenses.", href: "/compliance/licenses" },
        lots: lots.map((l) => ({ key: l.id, title: l.code, detail: `${l.brands?.name ?? ""} · packaged ${formatDate(l.packaged_on)}`, href: `/compliance/lots/${l.id}` })),
        lotsEmpty: q && lots.length === 0 ? noLotMatch : undefined,
      }}
      linkRows
      cadenceHrefs={Object.fromEntries(CADENCES.map(([c, name]) => [name, `/compliance?cadence=${c}`]))}
      controls={<ListControls search={{ label: "Search lot codes", value: q, keep: on > 0 ? { cadence } : {} }} />}
    />
  );
}
