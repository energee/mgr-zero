// lib/mgr/receipt-view.ts — view-model for Receipt (inventory echo).
import { poNo } from "./doc-no";
export type ReceiptViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  status: string;
  stillOwed: string;
  tape: [string, string][];
  info: string;
};

type PostedReceiptSnapshot = {
  id: string; po_no: number; status: string;
  lines: { id: string; qty_open: number; material: { name: string; purchase_uom: string; purchase_uom_factor: number; base_uom: string } | null }[];
  receipts: { id: string; received_on: string; receipt_lines: { po_line_id: string; qty_counted: number; variance: number; lot_id?: string | null }[] }[];
};

/** Read one committed receipt, not the form's uncommitted counts. */
export function toPostedReceiptViewProps(po: PostedReceiptSnapshot, receiptId: string, backHref?: string): ReceiptViewModel | undefined {
  const receipt = po.receipts.find(item => item.id === receiptId);
  if (!receipt) return undefined;
  const name = (line: PostedReceiptSnapshot["lines"][number]) => line.material?.name ?? `Line ${line.id}`;
  const owed = po.lines.filter(line => line.qty_open > 0).map(line => `${line.qty_open}${line.material ? ` ${line.material.purchase_uom}` : ""} ${name(line)}`);
  return {
    title: `${poNo(po.po_no)} · received`, backTo: "Purchase orders", backHref,
    status: po.status.replaceAll("_", " "), stillOwed: owed.join(" · ") || "Nothing owed",
    tape: receipt.receipt_lines.map(count => {
      const line = po.lines.find(item => item.id === count.po_line_id);
      const material = line?.material;
      const quantity = material ? Number(count.qty_counted) * Number(material.purchase_uom_factor) : Number(count.qty_counted);
      const variance = Number(count.variance);
      return [
        `+${quantity}${material ? ` ${material.base_uom}` : ""} ${line ? name(line) : `Line ${count.po_line_id}`} · receipt`,
        [count.lot_id ? `Lot reference ${count.lot_id}` : undefined, variance === 0 ? "as expected" : `${variance > 0 ? "over" : "short"} ${Math.abs(variance)}${material ? ` ${material.purchase_uom}` : ""}`].filter(Boolean).join(" · "),
      ];
    }),
    info: `Received ${receipt.received_on}. Only counted quantities posted. Still owed reflects all receipts on this purchase order.`,
  };
}
