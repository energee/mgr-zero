// lib/mgr/receipt-view.ts — view-model for Receipt (inventory echo).
import { formatDate } from "@/lib/date-format";
import { poNo } from "./doc-no";
import { fromPacks } from "./pack-qty";
import type { RecoveryAttempt } from "@/lib/commands/recovery";

export type ReceiptBillViewModel = {
  receiptId: string;
  requestId?: string | null;
  status: "not_posted" | "pending" | "pushed" | "push_failed";
  billId?: string | null;
  error?: string | null;
  action?: "post" | "retry" | "corrected";
  mappingHref?: string;
  connectionRequired?: boolean;
  superseded?: boolean;
};

export type ReceiptBillContext = { canPost: boolean; connected: boolean; mappingsReady: boolean; mappingHref?: string };
export type ReceiptViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  status: string;
  stillOwed: string;
  tape: [string, string][];
  info: string;
  correction?: { href?: string };
  revisions?: { label: string; href?: string }[];
  bill?: ReceiptBillViewModel;
};

export type ReceiptSnapshot = {
  id: string; received_on: string; corrects_receipt_id?: string | null; corrected_by_receipt_id?: string | null;
  correction_reason?: string | null; location_id?: string | null; bin_id?: string | null;
  qbo_bill_id?: string | null; qbo_bill_request_id?: string | null;
  qbo_bill_status?: "pending" | "pushed" | "push_failed" | null; qbo_bill_error?: string | null;
  qbo_bill_receipt_id?: string | null;
  receipt_lines: {
    po_line_id: string; qty_expected?: number; qty_counted: number; variance: number; lot_id?: string | null;
    material_id?: string | null; material_name?: string | null; base_uom?: string | null;
    purchase_uom?: string | null; purchase_uom_factor?: number | null;
    lot_code?: string | null; lot_received_on?: string | null; lot_best_by?: string | null;
  }[];
};

type PostedReceiptSnapshot = {
  id: string; po_no: number; status: string;
  lines: { id: string; qty_open: number; material: { name: string; purchase_uom: string; purchase_uom_factor: number | null; base_uom: string | null } | null }[];
  receipts: ReceiptSnapshot[];
};

/** Links from a purchase order page (`base`) to one receipt, or to its correction form. */
export const receiptHref = (base: string, receiptId: string) => `${base}?receipt=${encodeURIComponent(receiptId)}`;
export const correctReceiptHref = (base: string, receiptId: string) => `${base}?correctReceipt=${encodeURIComponent(receiptId)}`;

/** "over 2 bags" / "short 1"; the caller handles a zero variance. */
export const formatVariance = (variance: number, uom?: string | null) => `${variance > 0 ? "over" : "short"} ${Math.abs(variance)}${uom ? ` ${uom}` : ""}`;

/** The command owns one frozen Bill attempt across every revision of a receipt. */
export function receiptBillPresentation(receipt: ReceiptSnapshot, context?: ReceiptBillContext): ReceiptBillViewModel {
  const status = receipt.qbo_bill_id || receipt.qbo_bill_status === "pushed" ? "pushed"
    : receipt.qbo_bill_status === "push_failed" ? "push_failed"
      : receipt.qbo_bill_status === "pending" || receipt.qbo_bill_request_id ? "pending" : "not_posted";
  const bill: ReceiptBillViewModel = {
    receiptId: receipt.qbo_bill_receipt_id ?? receipt.id,
    requestId: receipt.qbo_bill_request_id,
    status, billId: receipt.qbo_bill_id, error: receipt.qbo_bill_error,
    superseded: Boolean(receipt.corrected_by_receipt_id),
  };
  if (!context?.canPost || status === "pushed") return bill;
  if (!context.connected) return { ...bill, connectionRequired: true, mappingHref: context.mappingHref };
  // Reconciliation must use the saved canonical receipt, regardless of current mappings.
  if (status === "pending") return { ...bill, action: "retry" };
  if (status === "push_failed") return {
    ...bill, receiptId: receipt.id, mappingHref: context.mappingHref ?? "#",
    action: context.mappingsReady && !receipt.corrected_by_receipt_id ? "corrected" : undefined,
  };
  if (receipt.corrected_by_receipt_id) return bill;
  if (!context.mappingsReady) return { ...bill, mappingHref: context.mappingHref ?? "#" };
  return { ...bill, action: "post" };
}

/** Resume uncertainty, or retire a known rejection on an explicitly confirmed correction. */
export function receiptBillRequest(bill: ReceiptBillViewModel, pending?: Pick<RecoveryAttempt, "input" | "requestId"> | null) {
  const correcting = bill.status === "push_failed" && bill.action === "corrected";
  return pending && !correcting ? { input: pending.input, requestId: pending.requestId, discardRequestId: undefined } : {
    input: { receiptId: bill.receiptId, ...(correcting ? { newAttemptReason: "corrected" } : {}) },
    requestId: undefined, discardRequestId: correcting ? pending?.requestId : undefined,
  };
}

/** Read one committed receipt, not the form's uncommitted counts. */
export function toPostedReceiptViewProps(po: PostedReceiptSnapshot, receiptId: string, backHref?: string, billContext?: ReceiptBillContext): ReceiptViewModel | undefined {
  const receipt = po.receipts.find(item => item.id === receiptId);
  if (!receipt) return undefined;
  const name = (line: PostedReceiptSnapshot["lines"][number]) => line.material?.name ?? `Line ${line.id}`;
  const owed = po.lines.filter(line => line.qty_open > 0).map(line => `${line.qty_open}${line.material ? ` ${line.material.purchase_uom}` : ""} ${name(line)}`);
  return {
    title: `${poNo(po.po_no)} · receipt ${formatDate(receipt.received_on)}`, backTo: "Purchase orders", backHref,
    status: po.status.replaceAll("_", " "), stillOwed: owed.join(" · ") || "Nothing owed",
    bill: receiptBillPresentation(receipt, billContext),
    tape: receipt.receipt_lines.map(count => {
      const frozen = count.purchase_uom_factor != null && count.base_uom != null;
      const quantity = frozen ? fromPacks(Number(count.qty_counted), 0, Number(count.purchase_uom_factor)) : Number(count.qty_counted);
      const variance = Number(count.variance);
      return [
        `+${quantity} ${frozen ? count.base_uom : "purchase units"} ${count.material_name ?? `Line ${count.po_line_id}`} · receipt`,
        [frozen ? undefined : "Original units and name were not captured",
          count.lot_code ? `Lot ${count.lot_code}${count.lot_best_by ? ` · best by ${formatDate(count.lot_best_by)}` : ""}` : count.lot_id ? `Lot reference ${count.lot_id} · original lot metadata not captured` : undefined,
          variance === 0 ? "as expected" : formatVariance(variance, count.purchase_uom)].filter(Boolean).join(" · "),
      ];
    }),
    info: `Received ${formatDate(receipt.received_on)}.${receipt.corrected_by_receipt_id ? " This receipt is superseded; its original facts are retained." : " Only counted quantities posted."}${receipt.correction_reason ? ` Correction reason: ${receipt.correction_reason}.` : ""} Still owed reflects effective receipts on this purchase order.`,
    correction: !receipt.corrected_by_receipt_id && po.status !== "cancelled" ? { href: backHref && correctReceiptHref(backHref, receipt.id) } : undefined,
    revisions: [
      ...(receipt.corrects_receipt_id ? [{ label: "Original receipt", href: backHref && receiptHref(backHref, receipt.corrects_receipt_id) }] : []),
      ...(receipt.corrected_by_receipt_id ? [{ label: "Corrected receipt", href: backHref && receiptHref(backHref, receipt.corrected_by_receipt_id) }] : []),
    ],
  };
}
