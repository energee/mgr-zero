// lib/mgr/fixtures/today.ts — get_today-shaped snapshots for Today personas.
// Views own no sample data.
import type { TodayItem } from "@/lib/commands/today";
import { DEMO_TIME_ZONE } from "@/lib/mgr/fixtures/settings";
import { NOTHING_WAITING, todayActions, toTodayViewProps, type TodayAction, type TodayRowView, type TodayViewModel } from "@/lib/mgr/today-view";
import type { StaffRole } from "@/lib/commands/registry";


/** The role's live quick actions, inert: the inventory keeps no live href. */
const actions = (role: StaffRole): TodayAction[] => todayActions([role]).map(({ label }) => ({ label }));

/** A pick due on Sep 2, seen on Thu Sep 3, with get_today's detail as written
 *  (20261017190000_today_ship_date_format.sql): the adapter drops the "pick due"
 *  the State column says and the date the Ships column says, sets its Overdue
 *  badge and attention dot (#993), and draws the amount; the inventory row keeps
 *  no live href. */
const OVERDUE_PICK: TodayItem = {
  reason: "pick_due", subjectType: "order", subjectId: "ord-0228", sourceVersion: "1",
  safeLabel: "ORD-0228", customerName: "Hillside Tavern", detail: "pick due · ships Sep 2, 2026", amountCents: 124000, dueAt: "2026-09-02T04:00:00Z",
  href: "/orders/ord-0228/pick", recipientRoles: ["warehouse"], assignedUserId: null,
};
const overduePick: TodayRowView = {
  ...toTodayViewProps({ items: [OVERDUE_PICK], timeZone: DEMO_TIME_ZONE, now: new Date("2026-09-03T16:00:00Z") }).rows[0],
  href: undefined,
};

/** Invoice-now refusals go straight to Sales' return-and-credit task. */
const refusedCredit: TodayRowView = {
  ...toTodayViewProps({ items: [{
    reason: "refused_credit", subjectType: "delivery", subjectId: "refused-1", sourceVersion: "1",
    safeLabel: "Refused beer to return and credit", customerName: null, detail: "Hillside Tavern · 2 units", amountCents: null,
    dueAt: null, href: "/invoices/inv-1043/return?refusedDeliveryId=refused-1",
    recipientRoles: ["admin", "sales"], assignedUserId: null,
  }] }).rows[0],
  href: undefined,
};

export const todayWarehouse: TodayViewModel = {
  actions: actions("warehouse"),
  rows: [
    { key: "pick", title: "3 orders ready", state: "Pick due", detail: "quantities default to ordered", verb: "Pick", tone: "info", warning: true, icon: "package" },
    overduePick,
    { key: "restock", title: "Staged · ORD-0229", state: "Restock due", detail: "restock 3 Pils cases to Warehouse", verb: "Put back", tone: "attention", warning: true, icon: "package" },
    { key: "po", title: "PO-0142 · Fictional Malt Supply", detail: "arrives Thu", verb: "Receive", tone: "info", icon: "truck" },
    { key: "route", title: "Next delivery · Ridgeline", state: "Next stop", detail: "your route · stop 1 of 3", verb: "Resume", tone: "info", icon: "route" },
  ],
};

export const todayEmpty: TodayViewModel = {
  actions: actions("warehouse"),
  empty: NOTHING_WAITING,
  rows: [],
};

export const todaySales: TodayViewModel = {
  actions: actions("sales"),
  rows: [
    { key: "ord1", title: "ORD-0231", customer: "Ridgeline", state: "Submitted", ships: "Sep 3", amount: "$1,240.00", detail: "", verb: "Confirm", tone: "success", warning: true, icon: "package" },
    { key: "ord2", title: "ORD-0235", customer: "Teresa’s", state: "Submitted", ships: "Sep 4", amount: "$386.50", detail: "", verb: "Confirm", tone: "success", icon: "package" },
    refusedCredit,
    { key: "pils", title: "Pils · 16 oz case", detail: "Not enough Pils for 2 orders", verb: "Choose who gets it", tone: "attention", warning: true },
    { key: "hazy", title: "Hazy IPA · ½ bbl", detail: "11 ready · fine" },
    { key: "oh", title: "Al’s Bar · OH", detail: "Al’s Bar can’t receive Stout in OH", verb: "Fix registration", tone: "attention", warning: true },
    { key: "inv", title: "INV-1042", customer: "Ridgeline", state: "Question", detail: "buyer asked about this invoice", verb: "Open", tone: "primary", warning: true },
  ],
};

export const todayBrewer: TodayViewModel = {
  actions: actions("brewer"),
  rows: [
    { key: "fv3", title: "FV3 · Stout", state: "Reading due", overdue: true, detail: "last read 31 h ago", verb: "Reading", tone: "info", warning: true, icon: "thermo" },
    { key: "brew", title: "B-0416 · Hazy IPA v4", detail: "brew day Sep 4, 2026 · 15 bbl", verb: "Start", tone: "info", icon: "beer" },
    { key: "run", title: "RUN-0031 · Hazy cans", detail: "packaged today · close due", verb: "Close", tone: "info", warning: true, icon: "package" },
    { key: "fv1", title: "FV1 · Pils", detail: "1.9 °P · read 4 h ago", icon: "thermo" },
  ],
};

export const todayDriver: TodayViewModel = toTodayViewProps({
  timeZone: DEMO_TIME_ZONE,
  now: new Date("2026-09-03T16:00:00Z"),
  items: [{
    reason: "delivery_next", subjectType: "delivery", subjectId: "stop-1", sourceVersion: "1",
    safeLabel: "Route A · stop 1", customerName: null, detail: "next stop", amountCents: null, dueAt: "2026-09-03T04:00:00Z",
    href: "#", recipientRoles: ["admin", "warehouse"], assignedUserId: "driver-1",
  }],
});

export const todayTaproom: TodayViewModel = {
  rows: [
    { key: "board", title: "Tap board", detail: "11 kegs on tap · last opened Thu 11:20am", verb: "Open", tone: "info", icon: "beer" },
    { key: "count", title: "Weekly count", detail: "last saved Sep 7 at 9:14pm", verb: "Count", tone: "info", icon: "task" },
    { key: "var", title: "Variance · 4 weeks", detail: "+0.6 bbl expected minus actual · as of now", verb: "Review", tone: "info", icon: "task" },
  ],
};
