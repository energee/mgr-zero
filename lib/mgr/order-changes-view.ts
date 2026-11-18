// lib/mgr/order-changes-view.ts — changes made to orders after confirm (Phase C
// of docs/plans/portal-release-windows.md). Each is a lines_adjusted event with
// a reason code; order_change_rows (staff) and portal_order_change_rows (buyer)
// return its per-SKU deltas. This module words those deltas once for both, and
// maps the staff report (list_order_changes) onto its rows and filters.
import { z } from "zod";
import type { ScopeOption } from "@/components/mgr/scope-pick";
import { formatDateTime } from "@/lib/date-format";
import { docNo } from "./doc-no";
import type { EmptyState } from "./empty-state";
import { ORDER_CHANGE_REASONS } from "./enums";
import { sentenceCase } from "./labels";
import { listParams } from "./list-params";

/** One SKU's change: the new quantity minus the old one (negative: fewer units). */
export type OrderLineChange = { sku_id: string; name: string | null; delta: number };

/** "Monarch 1/6 bbl −2, Pils +3": each changed line with its signed quantity (a true minus). */
export function lineChangesText(changes: OrderLineChange[]) {
  return changes.map((c) => {
    const delta = Number(c.delta);
    return `${c.name ?? "Item"} ${delta < 0 ? `−${-delta}` : `+${delta}`}`;
  }).join(", ");
}

/** What the buyer reads: "Changed after confirm: Damaged, Monarch 1/6 bbl −2". */
export function changedAfterConfirmText(reasonCode: string, changes: OrderLineChange[]) {
  return `Changed after confirm: ${[sentenceCase(reasonCode), lineChangesText(changes)].filter(Boolean).join(", ")}`;
}

/** One order_change_rows row, as list_order_changes returns it. */
export type OrderChangeRow = {
  id: string;
  created_at: string;
  order_id: string;
  order_no: number | null;
  customer_id: string | null;
  customer_name: string | null;
  actor: string | null;
  reason_code: string;
  note: string | null;
  changes: OrderLineChange[];
};

export type OrderChangeRowView = { key: string; title: string; detail: string; href?: string };

export type OrderChangesViewModel = {
  backHref?: string;
  reason: string;
  reasonOptions: ScopeOption[];
  staff: string;
  staffOptions: ScopeOption[];
  customer: string;
  customerOptions: ScopeOption[];
  rows: OrderChangeRowView[];
  empty?: EmptyState;
};

export type OrderChangesSnapshot = {
  backHref?: string;
  timeZone: string;
  rows: OrderChangeRow[];
  /** Staff user id → name; an actor not in it reads as a former team member. */
  staffNames: Record<string, string>;
  reason?: string;
  reasonOptions?: ScopeOption[];
  staff?: string;
  staffOptions?: ScopeOption[];
  customer?: string;
  customerOptions?: ScopeOption[];
};

/** Rows read "ORD-0231 · Ridgeline Taproom" over "Damaged · Monarch 1/6 bbl −2 · by Maria · Sep 2, 1:15 PM · note".
 *  A row links to its order only when the live page gave backHref. */
export function toOrderChangesViewProps(s: OrderChangesSnapshot): OrderChangesViewModel {
  const reason = s.reason ?? "all";
  const staff = s.staff ?? "all";
  const customer = s.customer ?? "all";
  const filtered = reason !== "all" || staff !== "all" || customer !== "all";
  const rows = s.rows.map((r) => ({
    key: r.id,
    title: `${docNo("ORD", r.order_no, "Order")} · ${r.customer_name ?? "Customer"}`,
    detail: [
      sentenceCase(r.reason_code),
      lineChangesText(r.changes),
      `by ${(r.actor && s.staffNames[r.actor]) ?? "a former team member"}`,
      formatDateTime(r.created_at, s.timeZone),
      r.note?.trim(),
    ].filter(Boolean).join(" · "),
    href: s.backHref ? `/orders/${r.order_id}` : undefined,
  }));
  return {
    backHref: s.backHref,
    reason,
    reasonOptions: s.reasonOptions ?? [{ value: "all", label: "All reasons" }],
    staff,
    staffOptions: s.staffOptions ?? [{ value: "all", label: "All staff" }],
    customer,
    customerOptions: s.customerOptions ?? [{ value: "all", label: "All customers" }],
    rows,
    empty: rows.length ? undefined : filtered ? { title: "No matching changes" } : { title: "No changes after confirm yet" },
  };
}

type Named = { id: string; name: string };

/** A param that is not a known code or one uuid filters nothing. */
const changeParams = z.object({
  reason: z.enum(ORDER_CHANGE_REASONS).optional().catch(undefined),
  staff: z.uuid().optional().catch(undefined),
  customer: z.uuid().optional().catch(undefined),
});

/** The ?reason=, ?staff= and ?customer= filters of /orders/changes, and each picker's options.
 *  An option links to the page with its one filter changed and the others kept; "all" drops it. */
export function orderChangesScope(searchParams: Record<string, string | string[] | undefined>) {
  const { params, hrefWith } = listParams(changeParams, searchParams);
  const path = "/orders/changes";
  return {
    ...params,
    reasonOptions: (): ScopeOption[] => [
      { value: "all", label: "All reasons", href: hrefWith(path, { reason: undefined }) },
      ...ORDER_CHANGE_REASONS.map((value) => ({ value, label: sentenceCase(value), href: hrefWith(path, { reason: value }) })),
    ],
    staffOptions: (team: Named[]): ScopeOption[] => [
      { value: "all", label: "All staff", href: hrefWith(path, { staff: undefined }) },
      ...team.map((m) => ({ value: m.id, label: m.name, href: hrefWith(path, { staff: m.id }) })),
    ],
    customerOptions: (customers: Named[]): ScopeOption[] => [
      { value: "all", label: "All customers", href: hrefWith(path, { customer: undefined }) },
      ...customers.map((c) => ({ value: c.id, label: c.name, href: hrefWith(path, { customer: c.id }) })),
    ],
  };
}
