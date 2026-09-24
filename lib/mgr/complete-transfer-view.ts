// lib/mgr/complete-transfer-view.ts — view-model for Complete transfer.
import { docNo } from "./doc-no";
import { formatVolume } from "@/lib/volume";

export type CompleteTransferLineView = {
  key: string;
  name: string;
  detail: string;
  picked: number;
  qty: number;
  tone?: "" | "w" | "ok";
};

export type CompleteTransferViewModel = {
  backTo: string;
  backHref?: string;
  fromLabel: string;
  toLabel: string;
  lines: CompleteTransferLineView[];
  tape: [string, string][];
};

export type CompleteTransferSnapshot = {
  backHref?: string;
  order: {
    id: string;
    order_no: number | null;
    from_location_id: string;
    to_location_id: string | null;
  };
  lines: { id: string; qty_ordered: number; qty_picked: number | null; qty_shipped?: number | null; bbl_per_unit?: number; skus: { name: string } | null }[];
  locations: { id: string; name: string }[];
};

export function toCompleteTransferViewProps({ order, lines, locations, backHref }: CompleteTransferSnapshot): CompleteTransferViewModel {
  const name = (lid: string | null) => locations.find((l) => l.id === lid)?.name ?? "—";
  return {
    backTo: docNo("ORD", order.order_no, "Transfer"),
    backHref,
    fromLabel: name(order.from_location_id),
    toLabel: name(order.to_location_id),
    tape: lines.flatMap(line => {
      const qty = Number(line.qty_shipped ?? line.qty_picked ?? 0);
      if (qty <= 0) return [];
      const volume = line.bbl_per_unit === undefined ? "" : formatVolume(qty * line.bbl_per_unit);
      return [
        [`−${qty} ${line.skus?.name ?? "Line"} · taproom transfer · ${name(order.from_location_id)}`, volume],
        [`+${qty} ${line.skus?.name ?? "Line"} · taproom transfer · ${name(order.to_location_id)}`, volume],
      ] as [string, string][];
    }),
    lines: lines.map((l) => {
      const picked = Number(l.qty_picked ?? 0);
      const ordered = Number(l.qty_ordered);
      const qty = Number(l.qty_shipped ?? picked);
      return {
        key: l.id,
        name: l.skus?.name ?? "Line",
        detail: `${qty} / ${picked}`,
        picked,
        qty,
        tone: picked < ordered ? "w" : "ok",
      };
    }),
  };
}
