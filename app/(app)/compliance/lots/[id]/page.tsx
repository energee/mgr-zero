// app/(app)/compliance/lots/[id]/page.tsx — Lot trace (screen record Lot
// trace): the lot, its packaging run, tank and batch, and every ledger
// movement that names the lot, with the actual shipment recipients.
import { LotTraceView } from "@/components/mgr/views/lot-trace";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toLotTraceViewProps } from "@/lib/mgr/lot-trace-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import type { LotTraceSnapshot } from "@/lib/mgr/lot-trace-view";

export default async function LotTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const trace = (await orNotFound(runCommand("trace_lot", { lotId: id }, ctx))) as LotTraceSnapshot;
  return <LotTraceView model={toLotTraceViewProps(trace, "/compliance")} tape={null} />;
}
