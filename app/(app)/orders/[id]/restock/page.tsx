// app/(app)/orders/[id]/restock/page.tsx — Put back: the staged quantities
// left after an adjust-after-pick or cancel-when-picked, drawn to the Put
// back screen record. Reads get_order; the button runs confirm_restock
// (put-back-button.tsx). Nothing moves in the ledger.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import { PutBackButton } from "./put-back-button";

type Line = { id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null };
type Order = { id: string; order_no: number | null; status: string; needs_restock: boolean };

export default async function RestockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { order, lines } = await orNotFound(runCommand("get_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: Line[] }>);
  const label = docNo("ORD", order.order_no, "Order");
  // What is on the floor and no longer wanted: everything picked on a
  // cancelled order, the picked excess on an adjusted-down one.
  const staged = lines
    .map((l) => ({ ...l, staged: Math.max(0, Number(l.qty_picked ?? 0) - (order.status === "cancelled" ? 0 : Number(l.qty_ordered))) }))
    .filter((l) => l.staged > 0);
  const total = staged.reduce((n, l) => n + l.staged, 0);
  return (
    <>
      {E.back("Today", `${label} · put back`, undefined, "/")}
      {order.needs_restock ? (
        <>
          {E.note("Staged beer stayed on the floor after this order changed. Put it back on the shelf.")}
          {staged.map((l) => <div key={l.id}>{E.row(l.skus?.name ?? "Line", "staged after pick", String(l.staged), "w")}</div>)}
          {E.sp()}
          <PutBackButton orderId={order.id} label={total ? `Put back ${total}` : "Put back"} />
        </>
      ) : (
        E.blank("Nothing to put back: the flag is already clear")
      )}
    </>
  );
}
