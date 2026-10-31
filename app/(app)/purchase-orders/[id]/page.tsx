// app/(app)/purchase-orders/[id]/page.tsx — one purchase order
// (get_purchase_order): header, lines with ordered / received / still due
// (derived from receipts, never stored), receipts so far, and the one next
// action for its state (po-actions.tsx): Mark sent (with Edit draft) or Receive,
// then reason-bearing cancellation before receipts or short closure after
// receiving, folded below it.
import { cache } from "react";
import { formatVariance, receiptHref, toPostedReceiptViewProps, type ReceiptSnapshot } from "@/lib/mgr/receipt-view";
import { notFound } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import { breweryToday, canRun } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { poNo } from "@/lib/mgr/doc-no";
import { OPEN_PO_STATUSES, receiveMode } from "@/lib/mgr/receive-po-view";
import { poDetailStatus } from "@/lib/mgr/purchase-orders-view";
import { ReceiveForm, ReceiptBillAdapter, type PoLine } from "./po-actions";
import { navTitle } from "@/lib/mgr/nav";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ receipt?: string; correctReceipt?: string }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const { id } = await params;
  const { receipt, correctReceipt } = await searchParams;
  await getPurchaseOrderPageData(id, receipt, correctReceipt);
  return { title: navTitle("/purchase-orders") };
}

type Po = {
  id: string; po_no: number; vendor_id: string; status: string; ordered_on: string | null; expected_on: string | null;
  sent_via: string | null; note: string | null; vendor: { name: string; email: string | null; qbo_vendor_id: string | null; qbo_realm_id: string | null } | null;
  closed_at: string | null; close_reason: string | null;
  lines: PoLine[];
  receipts: ReceiptSnapshot[];
  correction_receipt: ReceiptSnapshot | null; correction_lines: PoLine[];
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type OnHand = { location_id: string; bin_id: string; qty: number };
type QboHealth = { connected: boolean; realmId?: string; purchaseAccountId: string | null };

const getPurchaseOrderPageData = cache(async function getPurchaseOrderPageData(id: string, receipt?: string, correctReceipt?: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const po = await orNotFound(runCommand("get_purchase_order", { poId: id, correctionReceiptId: correctReceipt }, ctx)) as Po;
  let receiptModel: ReturnType<typeof toPostedReceiptViewProps>;
  if (receipt && !(correctReceipt && po.correction_receipt)) {
    // Warehouse retains receipt access without acquiring admin-only accounting reads or actions.
    const canPost = canRun(ctx, "post_receipt_bill");
    const health = canPost ? await runCommand("get_qbo_connection", {}, ctx) as QboHealth : null;
    receiptModel = toPostedReceiptViewProps(po, receipt, `/purchase-orders/${po.id}`, {
      canPost, connected: health?.connected ?? false,
      mappingsReady: Boolean(health?.purchaseAccountId && health.realmId && po.vendor?.qbo_vendor_id && po.vendor.qbo_realm_id === health.realmId),
      mappingHref: "/settings/accounting/mappings",
    });
    if (!receiptModel) notFound();
  }
  return { ctx, po, receiptModel };
});

export default async function PurchaseOrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { receipt, correctReceipt } = await searchParams;
  const { ctx, po, receiptModel } = await getPurchaseOrderPageData(id, receipt, correctReceipt);
  if (correctReceipt && po.correction_receipt) {
    const [locations, bins] = await Promise.all([
      runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
    ]) as [Location[], Bin[]];
    return <ReceiveForm key={correctReceipt} poId={po.id} correctionReceiptId={correctReceipt}
      lines={po.correction_lines} locations={locations} bins={bins} onHand={[]} today={po.correction_receipt.received_on}
      model={{ title: `${poNo(po.po_no)} · correct receipt`, state: "correction", locationId: po.correction_receipt.location_id ?? "", binId: po.correction_receipt.bin_id ?? "", status: `Received ${formatDate(po.correction_receipt.received_on)}`, backHref: receiptHref(`/purchase-orders/${po.id}`, correctReceipt) }} />;
  }
  if (receiptModel) return <ReceiptBillAdapter model={receiptModel} />;
  // Receive starts on the bin holding the most of the PO's first open material.
  const firstMaterial = receiveMode(po.status) === "receive" ? po.lines.find(line => line.qty_open > 0)?.material_id : undefined;
  const [locations, bins, today, onHand] = await Promise.all([
    runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), breweryToday(ctx),
    firstMaterial ? runCommand("get_material_on_hand", { materialId: firstMaterial }, ctx) : [],
  ]) as [Location[], Bin[], string, OnHand[]];
  const lineById = new Map(po.lines.map(line => [line.id, line]));
  return <ReceiveForm key={`${po.status}:${po.receipts.length}`} poId={po.id} lines={po.lines} locations={locations} bins={bins} onHand={onHand} today={today} model={{
    title: `${poNo(po.po_no)} · ${po.vendor?.name ?? "—"}`,
    backHref: "/purchase-orders", state: po.status, status: poDetailStatus(po), note: po.note ?? undefined,
    editHref: `/purchase-orders/${po.id}/edit`,
    closure: (OPEN_PO_STATUSES as readonly string[]).includes(po.status)
      ? po.receipts.length ? "short" : "cancel" : undefined,
    history: po.receipts.map(receipt => ({
      key: receipt.id, label: `${receipt.corrects_receipt_id ? "Corrected" : "Received"} ${formatDate(receipt.received_on)}${receipt.corrected_by_receipt_id ? " · superseded" : ""}`, href: receiptHref(`/purchase-orders/${po.id}`, receipt.id),
      detail: receipt.receipt_lines.map(count => {
        const line = lineById.get(count.po_line_id);
        const variance = Number(count.variance);
        return `${count.material_name ?? line?.material?.name ?? "line"} ${count.qty_counted}${variance === 0 ? "" : ` (${formatVariance(variance)})`}`;
      }).join(" · "),
    })),
  }} />;
}
