// lib/mgr/purchase-orders-view.ts — view-model for the Purchase orders list,
// and the status wording the list and one PO's page share.
import type { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/date-format";
import { sentenceCase } from "@/lib/mgr/labels";
import { WORK_CHIPS, WORK_TABS } from "@/lib/mgr/work-view";

export type PurchaseOrdersRowView = {
  key: string;
  title: string;
  detail: string;
  /** The next action; a closed order has none and its row is a plain link (#996). */
  verb?: string;
  tone?: "info" | "attention";
  warning?: boolean;
  href?: string;
};

export type PurchaseOrdersViewModel = {
  title: string;
  subtitle: string;
  rows: PurchaseOrdersRowView[];
  empty?: EmptyState;
  workChips: string[];
  workChipIndex: number;
  workTabs: Record<string, string>;
};

export type PurchaseOrdersSnapshot = {
  title: string;
  subtitle: string;
  rows?: PurchaseOrdersRowView[];
  empty?: EmptyState;
  /** Closed orders included, so an empty list means there are none at all. */
  includeClosed?: boolean;
};

/** How a PO's stored sent_via reads (mailto, external), on the PO and in a vendor's observed lead time. */
export const PO_SENT_VIA: Record<string, string> = { mailto: "from a mail client", external: "outside MGR" };

type PoStatusFacts = { status: string; closed_at: string | null; ordered_on: string | null; expected_on: string | null };

/** closed_at marks a cancelled or short-closed order; one closed short keeps status received. */
const closedLabel = (status: string) => (status === "cancelled" ? "Cancelled" : "Closed short");

/** A PO's status on its list row, in sentence case (#1501). */
export function poListStatus(po: PoStatusFacts & { lines_open: number }): string {
  if (po.closed_at) return closedLabel(po.status);
  if (po.status === "partially_received") return `Partially received · ${po.lines_open} ${po.lines_open === 1 ? "line" : "lines"} still due`;
  if (po.status === "sent") return `Sent${po.ordered_on ? ` ${formatDate(po.ordered_on)}` : ""}${po.expected_on ? ` · expected ${formatDate(po.expected_on)}` : ""}`;
  return sentenceCase(po.status);
}

/** A PO's status on its own page: the list's word, then the closure reason or how and when it was sent. */
export function poDetailStatus(po: PoStatusFacts & { sent_via: string | null; close_reason: string | null }): string {
  if (po.closed_at) return `${closedLabel(po.status)} · ${po.close_reason}`;
  if (po.status === "draft") return "Draft · not yet sent";
  const sent = po.ordered_on ? `Marked sent ${formatDate(po.ordered_on)}${po.sent_via ? ` · ${PO_SENT_VIA[po.sent_via] ?? po.sent_via}` : ""}` : sentenceCase(po.status);
  const expected = po.expected_on ? ` · expected ${formatDate(po.expected_on)}` : "";
  const received: Record<string, string> = { partially_received: " · partially received", received: " · received" };
  return `${sent}${expected}${received[po.status] ?? ""}`;
}

/** A purchase order row's next action, from its status. A received or
 *  cancelled order has none: its row is a plain link, because "Open" on a
 *  closed order reads as reopen (#996). A draft's verb matches the PO page's
 *  Mark sent button (#1501). */
export function purchaseOrderNext(status: string): { verb: string; tone: "info" | "attention" } | undefined {
  if (status === "draft") return { verb: "Mark sent", tone: "info" };
  if (status === "received" || status === "cancelled") return undefined;
  return { verb: "Receive", tone: status === "partially_received" ? "attention" : "info" };
}

export function toPurchaseOrdersViewProps(s: PurchaseOrdersSnapshot): PurchaseOrdersViewModel {
  const rows = s.rows ?? [];
  return {
    title: s.title,
    subtitle: s.subtitle,
    rows,
    empty: s.empty ?? (rows.length === 0
      ? { title: s.includeClosed ? "No purchase orders yet" : "No open purchase orders", description: "Raise one to order materials from a vendor." }
      : undefined),
    workChips: WORK_CHIPS,
    workChipIndex: 5,
    workTabs: WORK_TABS,
  };
}
