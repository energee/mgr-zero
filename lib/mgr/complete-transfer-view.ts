// lib/mgr/complete-transfer-view.ts — view-model for Complete transfer.
import { docNo } from "./doc-no";

export type CompleteTransferLineView = {
  key: string;
  name: string;
  detail: string;
  tone?: "" | "w" | "ok";
};

export type CompleteTransferViewModel = {
  backTo: string;
  backHref?: string;
  fromLabel: string;
  toLabel: string;
  lines: CompleteTransferLineView[];
};

export type CompleteTransferSnapshot = {
  order: {
    id: string;
    order_no: number | null;
    from_location_id: string;
    to_location_id: string | null;
  };
  lines: { id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null }[];
  locations: { id: string; name: string }[];
};

export function toCompleteTransferViewProps({ order, lines, locations }: CompleteTransferSnapshot): CompleteTransferViewModel {
  const name = (lid: string | null) => locations.find((l) => l.id === lid)?.name ?? "—";
  return {
    backTo: docNo("ORD", order.order_no, "Transfer"),
    backHref: `/orders/${order.id}`,
    fromLabel: name(order.from_location_id),
    toLabel: name(order.to_location_id),
    lines: lines.map((l) => {
      const picked = Number(l.qty_picked ?? 0);
      const ordered = Number(l.qty_ordered);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: `${picked} / ${picked}`,
        tone: picked < ordered ? "w" : "ok",
      };
    }),
  };
}
