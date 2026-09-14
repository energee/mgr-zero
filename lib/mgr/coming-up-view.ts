// lib/mgr/coming-up-view.ts — view-model for the portal's Coming up: planned
// batches as brand + week, a brand with nothing listed for wholesale flagged so
// the buyer knows to ask. Shop headings carry brandAnchor(name) as their id.
import type { EmptyState } from "./empty-state";

export type ScheduleRow = { brand_id: string; brand_name: string; planned_week: string };
export type ComingUpViewModel = {
  brewery: string;
  rows: { key: string; title: string; detail: string; warning: boolean; href: string }[];
  info: string;
  empty?: EmptyState;
};

export const brandAnchor = (name: string) => `brand-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
const week = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function toComingUpViewProps(s: { brewery: string; rows: ScheduleRow[]; listed: Set<string> }): ComingUpViewModel {
  return {
    brewery: s.brewery,
    rows: s.rows.map((r) => ({
      key: `${r.brand_id}-${r.planned_week}`, title: r.brand_name, href: `/portal#${brandAnchor(r.brand_name)}`,
      detail: `week of ${week.format(new Date(`${r.planned_week}T00:00:00Z`))}${s.listed.has(r.brand_name) ? "" : " · not yet listed"}`,
      warning: !s.listed.has(r.brand_name),
    })),
    info: `Dates are the brewery’s plan and can move. Ask ${s.brewery} to be notified when a batch is packaged.`,
    empty: s.rows.length ? undefined : { title: "Nothing planned yet", description: "Check back; the brewery has not scheduled a batch." },
  };
}
