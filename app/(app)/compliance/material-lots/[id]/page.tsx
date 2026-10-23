// app/(app)/compliance/material-lots/[id]/page.tsx — authorized material-lot recall adapter.
import { MaterialLotTraceView } from "@/components/mgr/views/material-lot-trace";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { toMaterialLotTraceViewProps, type MaterialLotTraceSnapshot } from "@/lib/mgr/material-lot-trace-view";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/compliance/material-lots") };

export default async function MaterialLotTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const trace = await orNotFound(runPageQuery("trace_material_lot", { materialLotId: id }, ctx)) as MaterialLotTraceSnapshot;
  return <MaterialLotTraceView model={toMaterialLotTraceViewProps(trace, brewery.timeZone, "/compliance")} />;
}
