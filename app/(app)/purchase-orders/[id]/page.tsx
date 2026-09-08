// app/(app)/purchase-orders/[id]/page.tsx — one purchase order
// (get_purchase_order): header, lines with ordered / received / still due
// (derived from receipts, never stored), receipts so far, and the one next
// action for its state (po-actions.tsx): Mark sent on a draft, Receive on a
// sent or partially received one.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { poNo } from "@/lib/mgr/doc-no";
import { MarkSentForm, ReceiveForm, type PoLine } from "./po-actions";

type Po = {
  id: string; po_no: number; vendor_id: string; status: string; ordered_on: string | null; expected_on: string | null;
  sent_via: string | null; note: string | null; vendor: { name: string; email: string | null } | null;
  lines: PoLine[];
  receipts: { id: string; received_on: string; receipt_lines: { po_line_id: string; qty_expected: number; qty_counted: number; variance: number }[] }[];
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

const VIA: Record<string, string> = { mailto: "from a mail client", external: "outside MGR" };

// mailto/external are attestations: "Marked sent", never "Delivered" (spec 2026-09-07 §1).
function statusLine(po: Po) {
  if (po.status === "draft") return "draft · not yet sent";
  const sent = po.ordered_on ? `Marked sent ${po.ordered_on}${po.sent_via ? ` · ${VIA[po.sent_via] ?? po.sent_via}` : ""}` : po.status;
  const expected = po.expected_on ? ` · expected ${po.expected_on}` : "";
  return `${sent}${expected}${po.status === "partially_received" ? " · partially received" : po.status === "received" ? " · received" : ""}`;
}

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const po = (await orNotFound(runCommand("get_purchase_order", { poId: id }, ctx))) as Po;
  const receiving = po.status === "sent" || po.status === "partially_received";
  const [locations, bins] = (await Promise.all([
    receiving ? runCommand("list_locations", {}, ctx) : [], receiving ? runCommand("list_bins", {}, ctx) : [],
  ])) as [Location[], Bin[]];

  return (
    <>
      {E.back("Purchase orders", `${poNo(po.po_no)} · ${po.vendor?.name ?? "—"}`, undefined, "/purchase-orders")}
      {E.fld("Status", statusLine(po))}
      {po.note && E.fld("Note", po.note)}
      {E.tbl(["material", "ordered", "received", "still due"], po.lines.map((l) => [
        `${l.material?.name ?? "—"}${l.expected_lot_code ? ` · lot ${l.expected_lot_code}` : ""}`,
        `${l.qty_ordered} ${l.material?.purchase_uom ?? ""}`, l.qty_received, l.qty_open,
      ]))}
      {po.receipts.length > 0 && (
        <>
          {E.ttl("Receipts")}
          {po.receipts.map((r) => (
            <div key={r.id}>{E.row(`Received ${r.received_on}`, r.receipt_lines.map((rl) => {
              const line = po.lines.find((l) => l.id === rl.po_line_id);
              const v = Number(rl.variance);
              return `${line?.material?.name ?? "line"} ${rl.qty_counted}${v === 0 ? "" : v > 0 ? ` (over ${v})` : ` (short ${-v})`}`;
            }).join(" · "))}</div>
          ))}
        </>
      )}
      {E.sp()}
      {po.status === "draft" && <MarkSentForm poId={po.id} />}
      {receiving && <ReceiveForm poId={po.id} lines={po.lines} locations={locations} bins={bins} />}
    </>
  );
}
