// lib/mgr/transfer-detail-view.ts — view-model for Transfer detail (get_stock_transfer).
import { trfNo } from "./doc-no";
import { sentenceCase } from "./labels";

export type TransferDetailLineView = {
  key: string;
  title: string;
  detail: string;
  qty: string;
};

export type TransferSourceLine = {
  id: string;
  qty: number;
  step: number;
  sources: { lotId: string | null; name: string; lotCode: string | null; qty: number }[];
};

export type TransferReceiveLine = {
  lineId: string;
  sources: { lotId: string | null; qty: number }[];
};

export type TransferDetailViewModel = {
  backHref?: string;
  title: string;
  from: string;
  to: string;
  status: string;
  note?: string;
  lines: TransferDetailLineView[];
  sources?: TransferSourceLine[];
  received: boolean;
  /** Also when Cancel transfer is offered: until received or cancelled (#578). */
  nextVerb?: string;
  cancelReason?: string;
};

export type TransferDetailSnapshot = {
  transfer: {
    id: string;
    transfer_no: number | null;
    status: string;
    note?: string | null;
    cancel_reason?: string | null;
    from_name: string;
    to_name: string;
  };
  lines: {
    id: string;
    name: string;
    from_bin: string;
    to_bin: string;
    qty: number;
    unit: string;
    qty_picked?: number | null;
  }[];
  sources?: TransferSourceLine[];
  backHref?: string;
};

/** Receive on a submitted transfer records the pick at the ordered quantities first (#1507). */
function nextVerb(status: string): string | undefined {
  if (status === "submitted" || status === "picked" || status === "in_transit") return "Receive";
  return undefined;
}

export function toTransferDetailViewProps({ transfer, lines, sources, backHref }: TransferDetailSnapshot): TransferDetailViewModel {
  const received = transfer.status === "received";
  return {
    backHref: backHref ?? "/transfers",
    title: trfNo(transfer.transfer_no),
    from: transfer.from_name,
    to: transfer.to_name,
    status: sentenceCase(transfer.status),
    note: transfer.note ?? undefined,
    received,
    sources,
    nextVerb: nextVerb(transfer.status),
    cancelReason: transfer.cancel_reason ?? undefined,
    lines: lines.map((l) => ({
      key: l.id,
      title: l.name,
      detail: `${l.from_bin} to ${l.to_bin}`,
      qty: l.qty_picked == null ? `${l.qty} ${l.unit}` : `${l.qty_picked} of ${l.qty} ${l.unit}`,
    })),
  };
}

/** One receive source's quantity: what was typed, else the whole picked
 *  quantity when the line has a single source (nothing to split), else blank. */
export const transferSourceQty = (typed: string | undefined, sourceCount: number, picked: number): string =>
  typed ?? (sourceCount === 1 ? String(picked) : "");

/** Preserve source identity while omitting lots that contribute no stock. */
export function transferReceiveSources(lines: TransferSourceLine[], quantities: Record<string, Record<string, string>>): TransferReceiveLine[] {
  return lines.map(line => ({
    lineId: line.id,
    sources: line.sources.map(source => ({
      lotId: source.lotId,
      qty: Number(transferSourceQty(quantities[line.id]?.[source.lotId ?? ""], line.sources.length, line.qty)),
    })).filter(source => source.qty > 0),
  }));
}
