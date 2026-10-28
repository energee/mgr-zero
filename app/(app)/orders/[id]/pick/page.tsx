import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData } from "../../order-data";
import type { PickSnapshot } from "@/lib/mgr/pick-view";
import { PickForm } from "../pick-form";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

const getPickPageData = cache(async function getPickPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "record_pick", "Pick");
  return getOrderPageData(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getPickPageData(id);
  return { title: navTitle("/orders") };
}

export default async function PickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, snapshot } = await getPickPageData(id);
  const { order, lines, sourceOnHand, events = [] } = snapshot as { order: PickSnapshot["order"] & { status: string }; lines: PickSnapshot["lines"]; sourceOnHand: PickSnapshot["sourceOnHand"]; events?: { id: string; created_at: string; event: string; payload: { line_id?: string } }[] };
  const locations = await runPageQuery("list_locations", {}, ctx) as PickSnapshot["locations"];
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  // Recovery-panel retries skip the original form callback. Existing events still identify the resolved line.
  const latestShort = new Map<string, string>();
  for (const event of events) {
    if (event.event === "short_pick" && typeof event.payload.line_id === "string") latestShort.set(event.payload.line_id, event.id);
  }
  const countedLines = lines.map(line => ({ ...line, ...(latestShort.has(line.id) ? { shortPickEventId: latestShort.get(line.id) } : {}) }));
  return <PickForm snapshot={{ order, lines: countedLines, sourceOnHand, locations, backHref: `/orders/${order.id}` }} />;
}
