// app/(app)/orders/[id]/confirm/page.tsx — Confirm order (screen record):
// two taps from Today. Loads the order, ATP and locations and hands them to
// ConfirmOrderForm (confirm-buttons.tsx): the lines with editable quantities
// and ATP, the oversell note, then Save lines, Confirm order or Cancel order. ponytail:
// the registry warning (a brand not registered for the ship-to state) waits
// on Program 9's registry check on confirm, ruled out of scope there.
// Lines ordering from a portal release are flagged Slipped or Over release
// from list_releases (confirm-order-view.ts).
import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData } from "../../order-data";
import "@/lib/commands/all";
import { ConfirmOrderForm } from "./confirm-buttons";
import { navTitle } from "@/lib/mgr/nav";
import { stepRedirect, type OrderStatus } from "@/lib/mgr/order-status";
import type { ReleaseRow } from "@/lib/mgr/release-view";

const getConfirmPageData = cache(async function getConfirmPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "confirm_order");
  return getOrderPageData(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getConfirmPageData(id);
  return { title: navTitle("/orders") };
}

type Order = { id: string; order_no: number | null; status: OrderStatus; requested_ship_date: string | null; from_location_id: string; customers: { name: string } | null };
type Line = { id: string; sku_id: string; qty_ordered: number; release_id: string | null; skus: { name: string } | null };

export default async function ConfirmOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, snapshot } = await getConfirmPageData(id);
  const { order, lines, atp, sourceOnHand } = snapshot as { order: Order; lines: Line[]; atp: { sku_id: string; qty: number }[]; sourceOnHand: { sku_id: string; qty: number }[] };
  const away = stepRedirect("confirm_order", order);
  if (away) redirect(away);
  const releaseIds = [...new Set(lines.flatMap((l) => (l.release_id ? [l.release_id] : [])))];
  const [locations, releases] = await Promise.all([
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
    releaseIds.length ? runCommand("list_releases", { ids: releaseIds }, ctx) as Promise<ReleaseRow[]> : Promise.resolve([]),
  ]);
  return <ConfirmOrderForm key={lines.map((l) => `${l.id}:${l.qty_ordered}`).join()} snapshot={{ order, lines, atp, sourceOnHand, locations, releases, backHref: "/orders" }} />;
}
