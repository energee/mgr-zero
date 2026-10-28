// app/(app)/compliance/lots/[id]/page.tsx — Lot trace (screen record Lot
// trace): the lot, its packaging run, tank and batch, and every ledger
// movement that names the lot, with the actual shipment recipients.
import { cache } from "react";
import { LotTraceView } from "@/components/mgr/views/lot-trace";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toLotTraceViewProps } from "@/lib/mgr/lot-trace-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import type { LotTraceSnapshot } from "@/lib/mgr/lot-trace-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { trace } = await getLotTracePageData(id);
  return { title: trace.lot.code };
}

const getLotTracePageData = cache(async function getLotTracePageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const trace = (await orNotFound(runCommand("trace_lot", { lotId: id }, ctx))) as LotTraceSnapshot;
  return { brewery, trace };
});

export default async function LotTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, trace } = await getLotTracePageData(id);
  return <LotTraceView model={toLotTraceViewProps(trace, brewery.timeZone, "/compliance")} tape={null} />;
}
