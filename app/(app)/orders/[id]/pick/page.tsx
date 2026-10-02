import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { PickSnapshot } from "@/lib/mgr/pick-view";
import { PickForm } from "../pick-form";
import "@/lib/commands/all";

export default async function PickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "record_pick", "Pick");
  const [{ order, lines, events = [] }, locations] = await Promise.all([
    orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as Promise<{ order: PickSnapshot["order"] & { status: string }; lines: PickSnapshot["lines"]; events?: { id: string; created_at: string; event: string; payload: { line_id?: string } }[] }>,
    runPageQuery("list_locations", {}, ctx) as Promise<PickSnapshot["locations"]>,
  ]);
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  // Recovery-panel retries skip the original form callback. Existing events still identify the resolved line.
  const latestShort = new Map<string, string>();
  for (const event of events) {
    if (event.event === "short_pick" && typeof event.payload.line_id === "string") latestShort.set(event.payload.line_id, event.id);
  }
  const countedLines = lines.map(line => ({ ...line, ...(latestShort.has(line.id) ? { shortPickEventId: latestShort.get(line.id) } : {}) }));
  return <PickForm snapshot={{ order, lines: countedLines, locations, backHref: `/orders/${order.id}` }} />;
}
