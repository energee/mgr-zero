// lib/mgr/transfer-detail-view.ts — view-model for Transfer detail (get_stock_transfer).
import { trfNo } from "./doc-no";

export type TransferDetailLineView = {
  key: string;
  title: string;
  detail: string;
  qty: string;
};

export type TransferDetailViewModel = {
  backHref?: string;
  title: string;
  from: string;
  to: string;
  status: string;
  note?: string;
  lines: TransferDetailLineView[];
  received: boolean;
  nextVerb?: string;
};

export type TransferDetailSnapshot = {
  transfer: {
    id: string;
    transfer_no: number | null;
    status: string;
    note?: string | null;
    from_name: string;
    to_name: string;
  };
  lines: {
    id: string;
    name: string;
    from_bin: string;
    to_bin: string;
    qty: number;
    qty_picked?: number | null;
  }[];
  backHref?: string;
};

function nextVerb(status: string): string | undefined {
  if (status === "draft") return "Submit";
  if (status === "submitted") return "Record pick";
  if (status === "picked" || status === "in_transit") return "Receive";
  return undefined;
}

export function toTransferDetailViewProps({ transfer, lines, backHref }: TransferDetailSnapshot): TransferDetailViewModel {
  const received = transfer.status === "received";
  return {
    backHref: backHref ?? "/transfers",
    title: trfNo(transfer.transfer_no),
    from: transfer.from_name,
    to: transfer.to_name,
    status: transfer.status.replaceAll("_", " "),
    note: transfer.note ?? undefined,
    received,
    nextVerb: nextVerb(transfer.status),
    lines: lines.map((l) => ({
      key: l.id,
      title: l.name,
      detail: `${l.from_bin} to ${l.to_bin}`,
      qty: l.qty_picked == null ? String(l.qty) : `${l.qty_picked} / ${l.qty}`,
    })),
  };
}
