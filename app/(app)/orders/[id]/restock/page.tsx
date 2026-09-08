// app/(app)/orders/[id]/restock/page.tsx — Put back: the staged quantities
// left after an adjust-after-pick or cancel-when-picked, drawn to the Put
// back screen record. Reads get_order; the button runs confirm_restock
// (put-back-button.tsx). Nothing moves in the ledger.
import { PutBackView } from "@/components/mgr/views/put-back";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toPutBackViewProps } from "@/lib/mgr/put-back-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { PutBackButton } from "./put-back-button";

type Line = { id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null };
type Order = { id: string; order_no: number | null; status: string; needs_restock: boolean };

export default async function RestockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { order, lines } = await orNotFound(runCommand("get_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: Line[] }>);
  const model = toPutBackViewProps({ order, lines, backHref: "/" });
  return (
    <PutBackView
      model={model}
      footer={model.empty ? undefined : <PutBackButton orderId={order.id} label={model.verb ?? "Put back"} />}
    />
  );
}
