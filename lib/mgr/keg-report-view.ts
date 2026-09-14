// lib/mgr/keg-report-view.ts — view-model for Keg report: the words for
// get_keg_report's numbers (utilization, age buckets with deposits at risk,
// customers holding kegs over 90 days, utilization per pool × size). The
// inventory fixture is a KegReport too, so both render through this adapter.
import type { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/date-format";
import { SIZE_LABEL } from "./keg-labels";
import { money } from "./money";

export type KegReport = {
  fleet: { out: number; total: number; utilization: number | null };
  bySize: { pool_id: string; pool_name: string; keg_size: string; out: number; total: number }[];
  aging: { bucket: string; kegs: number; deposit_cents: number }[];
  customers: { customer_id: string; name: string; over_90: number; oldest_at: string | null }[];
};

export type KegReportViewModel = {
  backHref?: string;
  headline: [string, string];
  aging: string[][];
  /** `href` is set by the live page only; the inventory leaves rows unlinked. */
  customers: { key: string; href?: string; title: string; detail: string; overdue: boolean }[];
  sizes: { key: string; title: string; detail: string; trailing: string }[];
  empty?: EmptyState;
};

const BUCKET_LABEL: Record<string, string> = { "0-30": "0–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days" };
const pct = (out: number, total: number) => total ? `${Math.round((out / total) * 100)}%` : "—";

export function toKegReportViewProps(r: KegReport, backHref?: string): KegReportViewModel {
  return {
    backHref,
    headline: [pct(r.fleet.out, r.fleet.total), `${r.fleet.out} of ${r.fleet.total} kegs out`],
    aging: r.aging.map((a) => [BUCKET_LABEL[a.bucket] ?? a.bucket, String(a.kegs), money(a.deposit_cents)]),
    customers: r.customers.map((c) => ({
      key: c.customer_id, href: backHref === undefined ? undefined : `/kegs/customers/${c.customer_id}`, title: c.name, overdue: c.over_90 > 0,
      detail: `${c.over_90 || "none"} over 90 days${c.oldest_at ? ` · oldest shipped ${formatDate(c.oldest_at)}` : ""}`,
    })),
    sizes: r.bySize.map((s) => ({ key: `${s.pool_id}-${s.keg_size}`, title: `${s.pool_name} ${SIZE_LABEL[s.keg_size] ?? s.keg_size}`, detail: `${s.out} of ${s.total} out`, trailing: `${pct(s.out, s.total)} utilized` })),
    empty: r.bySize.length ? undefined : { title: "No owned keg pools", description: "Add a keg pool and record kegs acquired to see utilization." },
  };
}
