// lib/mgr/coming-up-view.ts — view-model for the portal's Coming up: planned
// batches as brand + week, a brand with nothing on the buyer's wholesale list
// flagged so they know to ask. Rows are portal_schedule rows.
import { formatMonthDay } from "@/lib/date-format";
import type { EmptyState } from "./empty-state";
import { brandAnchor } from "./shop-view";

export type ScheduleRow = { brand_id: string; brand_name: string; planned_week: string; listed: boolean };
export type ComingUpSnapshot = { brewery: string; rows: ScheduleRow[] };
export type ComingUpViewModel = {
  brewery: string;
  rows: { key: string; title: string; detail: string; warning: boolean; href: string }[];
  info: string;
  empty?: EmptyState;
};

export function toComingUpViewProps(s: ComingUpSnapshot): ComingUpViewModel {
  return {
    brewery: s.brewery,
    rows: s.rows.map((r) => ({
      key: `${r.brand_id}-${r.planned_week}`, title: r.brand_name, href: `/portal#${brandAnchor(r.brand_name)}`,
      detail: `week of ${formatMonthDay(r.planned_week)}${r.listed ? "" : " · not yet listed"}`, warning: !r.listed,
    })),
    info: `Dates are the brewery’s plan and can move. Ask ${s.brewery} to be notified when a batch is packaged.`,
    empty: s.rows.length ? undefined : { title: "Nothing planned yet", description: "Check back; the brewery has not scheduled a batch." },
  };
}
