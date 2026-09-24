// lib/mgr/put-back-view.ts — view-model for Put back (staged restock).
import { docNo } from "./doc-no";

export type PutBackLineView = { key: string; name: string; staged: string };

export type PutBackViewModel = {
  backHref?: string;
  title: string;
  note?: string;
  lines: PutBackLineView[];
  verb?: string;
  empty?: boolean;
};

export type PutBackSnapshot = {
  backHref?: string;
  order: { id: string; order_no: number | null; status: string; needs_restock: boolean };
  lines: ({ id: string; skus: { name: string } | null } & StagedLine)[];
};

export type StagedLine = { qty_ordered: number; qty_picked: number | null; qty_shipped: number | null };

/** Staged, not yet put back: picked minus what the order keeps (nothing if
 *  cancelled, shipped once shipped, else ordered). confirm_restock_impl lowers
 *  qty_picked to the same kept amount. */
export function stagedQty(status: string, line: StagedLine): number {
  const kept = status === "cancelled" ? 0 : Number(line.qty_shipped ?? line.qty_ordered);
  return Math.max(0, Number(line.qty_picked ?? 0) - kept);
}

export function toPutBackViewProps({ order, lines, backHref }: PutBackSnapshot): PutBackViewModel {
  const title = `${docNo("ORD", order.order_no, "Order")} · put back`;
  if (!order.needs_restock) {
    return { backHref, title, lines: [], empty: true };
  }
  const staged = lines
    .map((l) => ({ ...l, staged: stagedQty(order.status, l) }))
    .filter((l) => l.staged > 0);
  const total = staged.reduce((n, l) => n + l.staged, 0);
  return {
    backHref,
    title,
    note: "Staged beer stayed on the floor after this order changed. Put it back on the shelf.",
    lines: staged.map((l) => ({ key: l.id, name: l.skus?.name ?? "Line", staged: String(l.staged) })),
    verb: total ? `Put back ${total}` : "Put back",
  };
}
