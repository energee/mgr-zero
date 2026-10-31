// lib/mgr/today-view.ts — view-model for Today and the persona landings.
import type { EmptyState } from "./empty-state";
import type { TodayItem } from "@/lib/commands/today";
import type { TaproomTodayRow } from "@/lib/mgr/taproom-today";
import { breweryDate, formatDateTime, formatTimeOfDay } from "@/lib/date-format";
import { hasAnyRole } from "@/lib/mgr/roles";

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

/** A quick action above Today's rows; the inventory leaves out `href`. */
export type TodayAction = { label: string; href?: string };

export type TodayViewModel = {
  date: string;
  actions?: TodayAction[];
  empty?: EmptyState;
  emptyVerb?: string;
  rows: TodayRowView[];
};

/** Today's quick actions in drawing order, each with the roles it is offered
 *  to (#1513). Admin is offered all four. Record movement passes `from` so its
 *  form returns to Today when it closes (#1475). */
const TODAY_ACTIONS: readonly (Required<TodayAction> & { roles: readonly string[] })[] = [
  { label: "New order", href: "/orders/new", roles: ["sales"] },
  { label: "Record movement", href: "/inventory?recordMovement=1&from=/", roles: ["warehouse"] },
  { label: "Receive PO", href: "/purchase-orders", roles: ["warehouse"] },
  { label: "New batch", href: "/batches", roles: ["brewer"] },
];

/** The quick actions a person holding `roles` is offered on Today. */
export function todayActions(roles: readonly string[]): TodayAction[] {
  return TODAY_ACTIONS.filter((a) => hasAnyRole(roles, ["admin", ...a.roles])).map(({ label, href }) => ({ label, href }));
}

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
  ship_due: ["Ship", "info"],
  restock_due: ["Put back", "attention"],
  delivery_next: ["Resume", "info"],
  refused_return: ["Check in", "attention"],
  refused_credit: ["Return and credit", "attention"],
  fermentation_reading_overdue: ["Record", "info"],
  invoice_question: ["Answer", "info"],
};

export type TodaySnapshot = {
  date: string;
  actions?: TodayAction[];
  empty?: EmptyState;
  emptyVerb?: string;
  rows?: TodayRowView[];
  items?: TodayItem[];
  taproom?: TaproomTodayRow[];
  /** breweries.timezone; required when any item carries a dueAt (timed or a ship/route date). */
  timeZone?: string;
  /** The clock that decides overdue versus due; tests pin it. */
  now?: Date;
};

/** Reasons whose dueAt is a real instant. The others (ship and route dates)
 *  store midnight of a calendar day that their detail already names, so a clock
 *  time there would be invented. */
const TIMED_DUE: TodayItem["reason"][] = ["fermentation_reading_overdue"];

/** "overdue since 12:30 PM" or "due 6:00 PM" in the brewery zone; a due time on
 *  another brewery day also names the date. */
function dueText(dueAt: string, timeZone: string, now: Date): string {
  const due = new Date(dueAt);
  const when = breweryDate(timeZone, due) === breweryDate(timeZone, now) ? formatTimeOfDay(due, timeZone) : formatDateTime(due, timeZone);
  return due <= now ? `overdue since ${when}` : `due ${when}`;
}

export const NOTHING_WAITING: EmptyState = { title: "Nothing waiting", description: "Nothing needs your attention right now." };

export function toTodayViewProps(s: TodaySnapshot): TodayViewModel {
  return { ...todayRows(s), ...(s.actions ? { actions: s.actions } : {}) };
}

function todayRows(s: TodaySnapshot): TodayViewModel {
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
      emptyVerb: s.emptyVerb,
      rows: [],
    };
  }
  const now = s.now ?? new Date();
  const today = s.timeZone ? breweryDate(s.timeZone, now) : undefined;
  return {
    date: s.date,
    rows: items.map((it) => {
      const [verb, tone] = TODAY_VERB[it.reason];
      if (it.dueAt && !s.timeZone) throw new Error(`toTodayViewProps: ${it.safeLabel} has a dueAt and needs the brewery time zone`);
      const timed = it.dueAt && TIMED_DUE.includes(it.reason) ? it.dueAt : null;
      // A ship or route date is past due once its brewery day is before today's (#993).
      const pastDay = Boolean(it.dueAt && !timed && breweryDate(s.timeZone!, new Date(it.dueAt)) < today!);
      return {
        key: `${it.reason}:${it.subjectId}`,
        title: it.customerName ? `${it.safeLabel} · ${it.customerName}` : it.safeLabel,
        detail: timed ? `${it.detail} · ${dueText(timed, s.timeZone!, now)}` : pastDay ? `${it.detail} · overdue` : it.detail,
        ...(it.dueAt ? { dueAt: it.dueAt } : {}),
        verb,
        tone,
        href: it.href,
        warning: tone === "attention" || it.reason === "pick_due" || pastDay,
        icon: SUBJECT_ICON[it.subjectType],
      };
    }),
  };
}
