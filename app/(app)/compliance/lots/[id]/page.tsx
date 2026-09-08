// app/(app)/compliance/lots/[id]/page.tsx — Lot trace (screen record Lot
// trace): the lot, its packaging run, tank and batch, and every ledger
// movement that names the lot. Shipments carry no lot until pick/ship records
// one, so the trace stops at the ledger rather than at a customer.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { treatmentLabel } from "@/app/(app)/settings/channels/tax-treatments";

type Trace = {
  lot: { id: string; code: string; brand: string; packaged_on: string; best_by: string | null };
  run: { id: string; run_no: number | null; bbl_drawn: number | null; vessel: string } | null;
  batch: { id: string; batch_no: number | null; brewed_on: string | null } | null;
  movements: { id: string; type: string; qty: number; created_at: string; sku: string; location: string }[];
  on_hand: number;
};

export default async function LotTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const t = (await orNotFound(runCommand("trace_lot", { lotId: id }, ctx))) as Trace;
  return (
    <>
      {E.back("Compliance months", t.lot.code, undefined, "/compliance")}
      {E.row([t.lot.brand, t.movements[0]?.sku].filter(Boolean).join(" · "), `run ${t.run?.run_no ?? "?"} · packaged ${t.lot.packaged_on}${t.lot.best_by ? ` · best by ${t.lot.best_by}` : ""}`, `${t.on_hand} on hand`)}
      {E.fld("Tank · batch", [t.run?.vessel, t.batch?.batch_no != null ? `batch ${t.batch.batch_no}` : null, t.batch?.brewed_on ? `brewed ${t.batch.brewed_on}` : null].filter(Boolean).join(" · "))}
      {E.fld("Drawn", t.run?.bbl_drawn != null ? `${Number(t.run.bbl_drawn).toFixed(2)} bbl` : "—")}
      {E.tape(t.movements.map((m) => [`${m.qty > 0 ? "+" : ""}${m.qty} · ${treatmentLabel(m.type)} · ${m.sku} · ${m.location}`, m.created_at.slice(0, 10)]))}
      {E.note("Shipments do not record a lot yet, so a customer who received this lot is not listed. Unsold units are the part a recall can still stop.")}
    </>
  );
}
