// lib/mgr/keg-history-view.ts — view-model for Keg event history: the ledger
// rows and the Keg pool and Customer scopes (ScopePick options; "all" selects
// every pool or customer), with the links the live page gives each option.
import { z } from "zod";
import type { ScopeOption } from "@/components/mgr/scope-pick";
import type { EmptyState } from "./empty-state";
import { listParams } from "./list-params";
export type KegHistoryRowView = {
  key: string;
  title: string;
  detail: string;
  warning?: boolean;
  ok?: boolean;
};

export type KegHistoryViewModel = {
  backHref?: string;
  pool: string;
  poolOptions: ScopeOption[];
  customer: string;
  customerOptions: ScopeOption[];
  rows: KegHistoryRowView[];
  empty?: EmptyState;
};

export type KegHistorySnapshot = Partial<Omit<KegHistoryViewModel, "empty">>;

export function toKegHistoryViewProps(s: KegHistorySnapshot): KegHistoryViewModel {
  const rows = s.rows ?? [];
  return {
    backHref: s.backHref,
    pool: s.pool ?? "all",
    poolOptions: s.poolOptions ?? [{ value: "all", label: "All pools" }],
    customer: s.customer ?? "all",
    customerOptions: s.customerOptions ?? [{ value: "all", label: "All customers" }],
    rows,
    empty: rows.length === 0 ? { title: "No matching events", description: "Widen the filter to see more of the keg's history." } : undefined,
  };
}

type Named = { id: string; name: string };

/** A param that is not one uuid scopes nothing: every pool, every customer. */
const historyParams = z.object({
  pool: z.uuid().optional().catch(undefined),
  customer: z.uuid().optional().catch(undefined),
});

/** The ?pool= and ?customer= scope of /kegs/history, and each picker's options.
 *  An option links to the page with its one scope changed and the other kept,
 *  so the two filters combine; "all" drops that scope from the link. */
export function kegHistoryScope(searchParams: Record<string, string | string[] | undefined>) {
  const { params: { pool: poolId, customer: customerId }, hrefWith } = listParams(historyParams, searchParams);
  const path = "/kegs/history";
  return {
    poolId,
    customerId,
    poolOptions: (pools: Named[]): ScopeOption[] => [
      { value: "all", label: "All pools", href: hrefWith(path, { pool: undefined }) },
      ...pools.map((p) => ({ value: p.id, label: p.name, href: hrefWith(path, { pool: p.id }) })),
    ],
    customerOptions: (customers: Named[]): ScopeOption[] => [
      { value: "all", label: "All customers", href: hrefWith(path, { customer: undefined }) },
      ...customers.map((c) => ({ value: c.id, label: c.name, href: hrefWith(path, { customer: c.id }) })),
    ],
  };
}
