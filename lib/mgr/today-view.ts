// lib/mgr/today-view.ts — view-model for Today and the persona landings.
import type { EmptyState } from "./empty-state";
import type { TodayItem } from "@/lib/commands/today";
import type { TaproomTodayRow } from "@/lib/mgr/taproom-today";
import { breweryDate, formatDateTime, formatTimeOfDay } from "@/lib/date-format";

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
  /** get_today's due instant, kept only when the item has one (#717). */
  dueAt?: string;
};

export type TodayViewModel = {
  date: string;
  empty?: EmptyState;
  emptyVerb?: string;
  rows: TodayRowView[];
};

const SUBJECT_ICON: Record<TodayItem["subjectType"], TodayIcon> = {
  order: "package",
  delivery: "route",
  occupancy: "thermo",
  invoice: "invoice",
};

/** The verb and tone each Today reason offers. Today and Work (lib/commands/landings.ts)
 *  both read this table; it lives here so the inventory import does not register commands. */
export const TODAY_VERB: Record<TodayItem["reason"], [string, "info" | "attention" | "success"]> = {
  submitted_order: ["Confirm", "success"],
  pick_due: ["Pick", "info"],
  restock_due: ["Put back", "attention"],
  delivery_next: ["Resume", "info"],
  refused_return: ["Check in", "attention"],
  fermentation_reading_overdue: ["Record", "info"],
  invoice_question: ["Answer", "info"],
};

export type TodaySnapshot = {
  date: string;
  empty?: EmptyState;
  emptyVerb?: string;
  rows?: TodayRowView[];
  items?: TodayItem[];
  taproom?: TaproomTodayRow[];
  /** breweries.timezone; required when any item carries a dueAt. */
  timeZone?: string;
  /** The clock that decides overdue versus due; tests pin it. */
  now?: Date;
};

/** "overdue since 12:30 PM" or "due 6:00 PM" in the brewery zone; a due time on
 *  another brewery day also names the date. */
function dueText(dueAt: string, timeZone: string, now: Date): string {
  const due = new Date(dueAt);
  const when = breweryDate(timeZone, due) === breweryDate(timeZone, now) ? formatTimeOfDay(due, timeZone) : formatDateTime(due, timeZone);
  return due <= now ? `overdue since ${when}` : `due ${when}`;
}

export const NOTHING_WAITING: EmptyState = { title: "Nothing waiting", description: "Nothing needs your attention right now." };

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
      empty: s.empty ?? NOTHING_WAITING,
      emptyVerb: s.emptyVerb ?? "Record movement",
      rows: [],
    };
  }
  const now = s.now ?? new Date();
  return {
    date: s.date,
    rows: items.map((it) => {
      const [verb, tone] = TODAY_VERB[it.reason];
      if (it.dueAt && !s.timeZone) throw new Error(`toTodayViewProps: ${it.safeLabel} has a dueAt and needs the brewery time zone`);
      return {
        key: `${it.reason}:${it.subjectId}`,
        title: it.safeLabel,
        detail: it.dueAt ? `${it.detail} · ${dueText(it.dueAt, s.timeZone!, now)}` : it.detail,
        ...(it.dueAt ? { dueAt: it.dueAt } : {}),
        verb,
        tone,
        href: it.href,
        warning: tone === "attention" || it.reason === "pick_due",
        icon: SUBJECT_ICON[it.subjectType],
      };
    }),
  };
}
