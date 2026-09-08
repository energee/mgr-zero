// app/(app)/compliance/page.tsx — Compliance months (screen record Compliance
// months): the recent months and every filed period, each with its filing
// state, the registry link, and the lots a trace can start from. Sales and
// Admin.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { Filing, LotRowOut } from "@/lib/commands/compliance";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { bbl, JURISDICTION, monthLabel, recentMonths } from "./period";

export default async function CompliancePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ filings, today }, lots] = (await Promise.all([runCommand("list_compliance_reports", {}, ctx), runCommand("list_lots", {}, ctx)])) as [{ filings: Filing[]; today: string }, LotRowOut[]];
  const filed = new Map(filings.filter((f) => f.jurisdiction === JURISDICTION).map((f) => [f.period_start.slice(0, 7), f]));
  const months = [...new Set([...recentMonths(today), ...filed.keys()])].sort().reverse();
  return (
    <>
      {E.hd("Compliance", "months")}
      {months.map((m) => {
        const f = filed.get(m);
        return (
          <Link key={m} href={`/compliance/${m}`}>
            {f ? E.nav(monthLabel(m), `filed ${f.filed_at?.slice(0, 10)} · ${bbl(f.figures.removals.taxable ?? 0)} bbl taxable`, "ok") : E.nav(monthLabel(m), "not filed · ready to review", "w")}
          </Link>
        );
      })}
      <Link href="/compliance/registry">{E.nav("Compliance registry", "brands, states and licenses")}</Link>
      {lots.length > 0 && E.ttl("Lot trace")}
      {lots.map((l) => <Link key={l.id} href={`/compliance/lots/${l.id}`}>{E.nav(l.code, `${l.brands?.name ?? ""} · packaged ${l.packaged_on}`)}</Link>)}
    </>
  );
}
