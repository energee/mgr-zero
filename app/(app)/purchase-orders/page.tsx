// app/(app)/purchase-orders/page.tsx — Work › POs: open purchase orders
// (list_purchase_orders; ?all=1 adds received and cancelled), each row naming
// its next action — Mark sent on a draft, Receive on a sent one — and opening
// its own page. New PO is new-po-form.tsx → create_purchase_order.
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PurchaseOrdersView } from "@/components/mgr/views/purchase-orders";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toPurchaseOrdersViewProps } from "@/lib/mgr/purchase-orders-view";
import "@/lib/commands/all";
import { poNo } from "@/lib/mgr/doc-no";


type Po = { id: string; po_no: number; status: string; expected_on: string | null; ordered_on: string | null; vendor_name: string | null; lines_open: number };

/** The row's next action. A received or cancelled order has none: its row is
 *  a plain link, because "Open" on a closed order reads as reopen (#996). */
function next(po: Po): { verb: string; tone: "info" | "attention" } | undefined {
  if (po.status === "draft") return { verb: "Mark sent", tone: "info" };
  if (po.status === "received" || po.status === "cancelled") return undefined;
  return { verb: "Receive", tone: po.status === "partially_received" ? "attention" : "info" };
}
const status = (po: Po) => {
  if (po.status === "partially_received") return `partially received · ${po.lines_open} ${po.lines_open === 1 ? "line" : "lines"} still due`;
  if (po.status === "sent") return `sent${po.ordered_on ? ` ${po.ordered_on}` : ""}${po.expected_on ? ` · expected ${po.expected_on}` : ""}`;
  return po.status;
};

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const pos = await runCommand("list_purchase_orders", { includeClosed: all === "1" }, ctx) as Po[];

  return (
    <PurchaseOrdersView
      model={toPurchaseOrdersViewProps({
        title: "Work",
        subtitle: all === "1" ? "every order" : "open orders",
        includeClosed: all === "1",
        rows: pos.map(po => ({ key: po.id, title: `${poNo(po.po_no)} · ${po.vendor_name ?? "—"}`, detail: status(po), ...next(po), href: `/purchase-orders/${po.id}`, warning: po.status === "partially_received" })),
      })}
      createAction={<Button size="sm" asChild><Link href="/purchase-orders/new">New PO</Link></Button>}
      linkRows
      workHrefs={workHrefsFor(brewery.roles)}
      footer={
        <p className="text-sm text-muted-foreground">
          {all === "1" ? <Link href="/purchase-orders" className="underline">Open orders only</Link> : <Link href="/purchase-orders?all=1" className="underline">Show received and cancelled</Link>}
        </p>
      }
    />
  );
}
