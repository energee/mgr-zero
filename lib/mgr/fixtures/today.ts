// lib/mgr/fixtures/today.ts — get_today-shaped snapshots for Today personas.
// Views own no sample data.
import type { TodayViewModel } from "@/lib/mgr/today-view";

const DATE = "Thu 9/3";

export const todayWarehouse: TodayViewModel = {
  date: DATE,
  rows: [
    { key: "pick", title: "3 orders ready", detail: "quantities default to ordered", verb: "Pick", tone: "info", warning: true, icon: "package" },
    { key: "restock", title: "Staged · ORD-0229", detail: "restock 3 Pils cases to Warehouse", verb: "Put back", tone: "attention", warning: true, icon: "package" },
    { key: "po", title: "PO-0142 · Country Malt", detail: "arrives Thu", verb: "Receive", tone: "info", icon: "truck" },
    { key: "route", title: "Next delivery · Ridgeline", detail: "your route · stop 1 of 3", verb: "Resume", tone: "info", icon: "route" },
  ],
};

export const todayEmpty: TodayViewModel = {
  date: DATE,
  empty: "Nothing waiting",
  emptyVerb: "Record movement",
  rows: [],
};

export const todaySales: TodayViewModel = {
  date: DATE,
  rows: [
    { key: "ord1", title: "ORD-0231 · Ridgeline", detail: "submitted · ships Thu", verb: "Confirm", tone: "success", warning: true, icon: "package" },
    { key: "ord2", title: "ORD-0235 · Teresa’s", detail: "submitted · ships Fri", verb: "Confirm", tone: "success", icon: "package" },
    { key: "pils", title: "Pils · 16 oz case", detail: "Not enough Pils for 2 orders", verb: "Choose who gets it", tone: "attention", warning: true },
    { key: "hazy", title: "Hazy IPA · ½ bbl", detail: "11 ready · fine" },
    { key: "oh", title: "Al’s Bar · OH", detail: "Al’s Bar can’t receive Stout in OH", verb: "Fix registration", tone: "attention", warning: true },
    { key: "inv", title: "INV-1042 · Ridgeline", detail: "buyer asked about this invoice", verb: "Open", tone: "primary", warning: true },
  ],
};

export const todayBrewer: TodayViewModel = {
  date: DATE,
  rows: [
    { key: "fv3", title: "FV3 · Stout", detail: "reading overdue 31 h", verb: "Reading", tone: "info", warning: true, icon: "thermo" },
    { key: "brew", title: "B-0416 · Hazy IPA v4", detail: "brew day Fri 9/4 · 15 bbl", verb: "Start", tone: "info", icon: "beer" },
    { key: "run", title: "RUN-0031 · Hazy cans", detail: "packaged today · close due", verb: "Close", tone: "info", warning: true, icon: "package" },
    { key: "fv1", title: "FV1 · Pils", detail: "1.9 °P · read 4 h ago", icon: "thermo" },
  ],
};

export const todayDriver: TodayViewModel = {
  date: DATE,
  rows: [
    { key: "s1", title: "Stop 1 · Ridgeline Tap Room", detail: "4 Hazy halves · 6 Pils cases", trailing: "next", warning: true },
    { key: "s2", title: "Stop 2 · Al’s Bar", detail: "2 Stout sixths · later" },
    { key: "s3", title: "Stop 3 · Teresa’s", detail: "8 Hazy halves · 12 Pils cases · later" },
  ],
};

export const todayTaproom: TodayViewModel = {
  date: DATE,
  rows: [
    { key: "board", title: "Tap board", detail: "11 open · last opened Thu 11:20am", verb: "Open", tone: "info", icon: "beer" },
    { key: "count", title: "Weekly count", detail: "last saved Sep 7 at 9:14pm", verb: "Count", tone: "info", icon: "task" },
    { key: "var", title: "Variance · 4 weeks", detail: "+0.6 bbl expected minus actual · as of now", verb: "Review", tone: "info", icon: "task" },
  ],
};
