// app/(app)/orders/[id]/restock/page.tsx — Put back: the staged quantities
// left after an adjust-after-pick, a short ship, or cancel-when-picked
// (stagedQty in put-back-view.ts), drawn to the Put
// back screen record. Reads get_order; the button runs confirm_restock
// (put-back-button.tsx), which lowers each line's picked amount to what the
// order keeps. Nothing moves in the ledger.
import { cache } from "react";
import { PutBackView } from "@/components/mgr/views/put-back";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { requirePagePermission } from "@/lib/mgr/page-query";
import { toPutBackViewProps } from "@/lib/mgr/put-back-view";
import "@/lib/commands/all";
import { getOrderPageData } from "../../order-data";
import { PutBackButton } from "./put-back-button";
import { navTitle } from "@/lib/mgr/nav";

const getRestockPageData = cache(async function getRestockPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "confirm_restock");
  return getOrderPageData(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getRestockPageData(id);
  return { title: navTitle("/orders") };
}

type Line = { id: string; qty_ordered: number; qty_picked: number | null; qty_shipped: number | null; skus: { name: string } | null };
type Order = { id: string; order_no: number | null; status: string; needs_restock: boolean };

export default async function RestockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { snapshot } = await getRestockPageData(id);
  const { order, lines } = snapshot as { order: Order; lines: Line[] };
  const model = toPutBackViewProps({ order, lines, backHref: "/" });
  return (
    <PutBackView
      model={model}
      footer={model.empty ? undefined : <PutBackButton orderId={order.id} label={model.verb ?? "Put back"} />}
    />
  );
}
