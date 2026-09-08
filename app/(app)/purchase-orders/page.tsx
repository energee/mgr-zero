// app/(app)/purchase-orders/page.tsx — Work › POs: open purchase orders
// (list_purchase_orders; ?all=1 adds received and cancelled), each row naming
// its next action — Mark sent on a draft, Receive on a sent one — and opening
// its own page. New PO is new-po-form.tsx → create_purchase_order.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { poNo } from "@/lib/mgr/doc-no";
import { NewPoForm } from "./new-po-form";

type Po = { id: string; po_no: number; status: string; expected_on: string | null; ordered_on: string | null; vendor_name: string | null; lines_open: number };
type Vendor = { id: string; name: string; active: boolean };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean };

function verb(po: Po): [string, "info" | "attention" | "success"] {
  if (po.status === "draft") return ["Mark sent", "info"];
  if (po.status === "received") return ["Open", "success"];
  if (po.status === "cancelled") return ["Open", "info"];
  return ["Receive", po.status === "partially_received" ? "attention" : "info"];
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
  const [pos, vendors, materials] = (await Promise.all([
    runCommand("list_purchase_orders", { includeClosed: all === "1" }, ctx),
    runCommand("list_vendors_and_contracts", {}, ctx), runCommand("list_materials", {}, ctx),
  ])) as [Po[], Vendor[], Material[]];

  return (
    <>
      {E.hd("Purchase orders", all === "1" ? "every order" : "open orders", <NewPoForm vendors={vendors.filter((v) => v.active)} materials={materials} />)}
      {pos.length === 0
        ? E.blank(all === "1" ? "No purchase orders yet" : "No open purchase orders")
        : pos.map((po) => {
            const [label, tone] = verb(po);
            return <div key={po.id}>{E.row(`${poNo(po.po_no)} · ${po.vendor_name ?? "—"}`, status(po), E.act(label, tone, `/purchase-orders/${po.id}`), po.status === "partially_received" ? "w" : "")}</div>;
          })}
      <p className="text-sm text-muted-foreground">
        {all === "1" ? <Link href="/purchase-orders" className="underline">Open orders only</Link> : <Link href="/purchase-orders?all=1" className="underline">Show received and cancelled</Link>}
      </p>
    </>
  );
}
