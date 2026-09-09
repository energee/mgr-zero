// lib/mgr/today-view.ts — view-model for Today and the persona landings.
import type { TodayItem } from "@/lib/commands/today";
import type { TaproomTodayRow } from "@/lib/mgr/taproom-today";

export type TodayIcon = "package" | "truck" | "route" | "thermo" | "beer" | "task" | "invoice";

export type TodayRowView = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
  tone?: "info" | "attention" | "success" | "primary";
  trailing?: string;
  warning?: boolean;
  href?: string;
  icon?: TodayIcon;
};

export type TodayViewModel = {
  date: string;
  empty?: string;
  emptyVerb?: string;
  rows: TodayRowView[];
};

const SUBJECT_ICON: Record<TodayItem["subjectType"], TodayIcon> = {
  order: "package",
  delivery: "route",
  occupancy: "thermo",
  invoice: "invoice",
};

/** Same table as TODAY_VERB in lib/commands/landings.ts — kept here so the
 *  inventory import of this adapter does not register commands. */
const TODAY_VERB: Record<TodayItem["reason"], [string, NonNullable<TodayRowView["tone"]>]> = {
  submitted_order: ["Confirm", "success"],
  pick_due: ["Pick", "info"],
  restock_due: ["Put back", "attention"],
  delivery_next: ["Resume", "info"],
  fermentation_reading_overdue: ["Record", "info"],
  invoice_question: ["Answer", "info"],
};

export type TodaySnapshot = {
  date: string;
  empty?: string;
  emptyVerb?: string;
  rows?: TodayRowView[];
  items?: TodayItem[];
  taproom?: TaproomTodayRow[];
};

export function toTodayViewProps(s: TodaySnapshot): TodayViewModel {
  if (s.rows !== undefined) {
    return { date: s.date, empty: s.empty, emptyVerb: s.emptyVerb, rows: s.rows };
  }
  if (s.taproom) {
    return {
      date: s.date,
      empty: s.empty,
      emptyVerb: s.emptyVerb,
      rows: s.taproom.map((row) => ({
        key: row.href,
        title: row.label,
        detail: row.detail,
        verb: row.verb,
        tone: "info",
        href: row.href,
      })),
    };
  }
  const items = s.items ?? [];
  if (items.length === 0) {
    return {
      date: s.date,
      empty: s.empty ?? "Nothing waiting",
      emptyVerb: s.emptyVerb ?? "Record movement",
      rows: [],
    };
  }
  return {
    date: s.date,
    rows: items.map((it) => {
      const [verb, tone] = TODAY_VERB[it.reason];
      return {
        key: `${it.reason}:${it.subjectId}`,
        title: it.safeLabel,
        detail: it.detail,
        verb,
        tone,
        href: it.href,
        warning: tone === "attention" || it.reason === "pick_due",
        icon: SUBJECT_ICON[it.subjectType],
      };
    }),
  };
}
