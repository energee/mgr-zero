// app/(app)/purchase-orders/[id]/page.tsx — one purchase order
// (get_purchase_order): header, lines with ordered / received / still due
// (derived from receipts, never stored), receipts so far, and the one next
// action for its state (po-actions.tsx): Mark sent on a draft, Receive on a
// sent or partially received one.
import { ReceiptView } from "@/components/mgr/views/receipt";
import { toPostedReceiptViewProps, type ReceiptSnapshot } from "@/lib/mgr/receipt-view";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { breweryToday } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { poNo } from "@/lib/mgr/doc-no";
import { ReceiveForm, type PoLine } from "./po-actions";

type Po = {
  id: string; po_no: number; vendor_id: string; status: string; ordered_on: string | null; expected_on: string | null;
  sent_via: string | null; note: string | null; vendor: { name: string; email: string | null } | null;
  lines: PoLine[];
  receipts: ReceiptSnapshot[];
  correction_receipt: ReceiptSnapshot | null; correction_lines: PoLine[];
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

const VIA: Record<string, string> = { mailto: "from a mail client", external: "outside MGR" };

function statusLine(po: Po) {
  if (po.status === "draft") return "draft · not yet sent";
  const sent = po.ordered_on ? `Marked sent ${po.ordered_on}${po.sent_via ? ` · ${VIA[po.sent_via] ?? po.sent_via}` : ""}` : po.status;
  const expected = po.expected_on ? ` · expected ${po.expected_on}` : "";
  return `${sent}${expected}${po.status === "partially_received" ? " · partially received" : po.status === "received" ? " · received" : ""}`;
}

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ receipt?: string; correctReceipt?: string }> }) {
  const { id } = await params;
  const { receipt, correctReceipt } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const po = await orNotFound(runCommand("get_purchase_order", { poId: id, correctionReceiptId: correctReceipt }, ctx)) as Po;
  if (correctReceipt && po.correction_receipt) {
    return <ReceiveForm key={correctReceipt} poId={po.id} correctionReceiptId={correctReceipt}
      lines={po.correction_lines} locations={[]} bins={[]} today={po.correction_receipt.received_on}
      model={{ title: `${poNo(po.po_no)} · correct receipt`, state: "correction", status: `Received ${po.correction_receipt.received_on}`, backHref: `/purchase-orders/${po.id}?receipt=${encodeURIComponent(correctReceipt)}` }} />;
  }
  if (receipt) {
    const model = toPostedReceiptViewProps(po, receipt, `/purchase-orders/${po.id}`);
    if (!model) notFound();
    return <ReceiptView model={model} />;
  }
  const [locations, bins, today] = await Promise.all([runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), breweryToday(ctx)]) as [Location[], Bin[], string];
  return <ReceiveForm key={`${po.status}:${po.receipts.length}`} poId={po.id} lines={po.lines} locations={locations} bins={bins} today={today} model={{
    title: `${poNo(po.po_no)} · ${po.vendor?.name ?? "—"}`,
    backHref: "/purchase-orders", state: po.status, status: statusLine(po), note: po.note ?? undefined,
    history: po.receipts.map(receipt => ({
      key: receipt.id, label: `${receipt.corrects_receipt_id ? "Corrected" : "Received"} ${receipt.received_on}${receipt.corrected_by_receipt_id ? " · superseded" : ""}`, href: `/purchase-orders/${po.id}?receipt=${encodeURIComponent(receipt.id)}`,
      detail: receipt.receipt_lines.map(count => {
        const line = po.lines.find(line => line.id === count.po_line_id);
        const variance = Number(count.variance);
        return `${count.material_name ?? line?.material?.name ?? "line"} ${count.qty_counted}${variance === 0 ? "" : variance > 0 ? ` (over ${variance})` : ` (short ${-variance})`}`;
      }).join(" · "),
    })),
  }} />;
}
