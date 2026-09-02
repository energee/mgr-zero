// components/mgr/screens.tsx — the screen inventory, ported from the
// wireframe file's SCREENS array one build step at a time (plan §7). Every
// record is typed; `states` is annotation the gallery captions under the
// frame, never markup inside it. Bodies use only the E vocabulary.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";

export type Tab = "Today" | "Beer" | "Work" | "More";
export type Screen = {
  step: number;
  slice: "all" | number;
  /** Staff tab the frame lives under; a Global sheet sets `group` instead. */
  tab?: Tab;
  group?: "Global" | "Entry" | "Portal" | "Desk";
  /** Portal tab, for PortalShell frames. */
  portal?: "Order" | "Orders" | "Invoices" | "Account";
  /** Default page; `sheet` and `entry` frames render as a panel over the shell. */
  surface?: "page" | "sheet" | "entry";
  /** Full-size exemplar drawn at ship scale. */
  ex?: boolean;
  name: string;
  job: string;
  reads: string;
  writes: string;
  states?: [string, string, (0 | 1)?][];
  spec?: string;
  /** Sheet/entry header, rendered above the body inside the panel. */
  hd?: ReactNode;
  body: ReactNode;
};

const today = (rows: ReactNode) => (
  <>
    {E.hd("Today", "Thu 9/3")}
    {rows}
  </>
);

export const SCREENS: Screen[] = [
  // step 1 — foundations and both authenticated shells
  {
    step: 1, slice: "all", tab: "Today", ex: true, name: "Today",
    job: "Role-filtered work that opens ready to finish · full-size exemplar at ship scale",
    reads: "get_today [design; delivery rows require assigned warehouse member or admin]", writes: "—",
    states: [["empty", "Nothing waiting · record below"], ["loading", "row-shaped skeletons"], ["error", "Today did not load · Retry", 1], ["offline", "cached rows · writes queue"], ["role hidden", "only relevant permitted work · no blank gaps"]],
    spec: "Drawn as the warehouse persona at honest 16px density. Rows are role-filtered per plan §3. The restock row appears while orders.needs_restock is set and opens Order · detail. Weekly count is gated: disabled with human copy, never a gate name.",
    body: today(<>
      {E.btns(["Pick", "Receive"], "c2")}
      {E.row("3 orders ready", "quantities default to ordered", "Pick", "w")}
      {E.row("Staged · ORD-0229", "restock 3 Pils cases to Warehouse", "Put back", "w")}
      {E.row("PO-0142 · Country Malt", "arrives Thu", "Receive")}
      {E.row("Next delivery · Sly Fox", "your route · stop 1 of 3", "Resume")}
      {E.gated("Weekly count")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Today · sales",
    job: "Sales landing: submitted orders to confirm and beer that is short",
    reads: "get_today [design; sales role filter] · get_shortfalls [design]", writes: "—",
    states: [["empty", "Nothing to confirm · new order below"], ["role hidden", "no Pick/Receive; no blank gaps"]],
    spec: "Same get_today read as the exemplar, filtered for sales. Confirm opens Order · confirm (2 taps); shortfall rows open Shortfall, pars and standing allocation.",
    body: today(<>
      {E.btns(["Confirm", "New order"], "c2")}
      {E.row("ORD-0231 · Sly Fox", "submitted · ships Thu", "Confirm", "w")}
      {E.row("ORD-0235 · Teresa’s", "submitted · ships Fri", "Confirm")}
      {E.row("Pils · 16 oz case", "ATP −6 · 2 orders compete", "Review", "w")}
      {E.row("Hazy IPA · ½ bbl", "ATP 11 · fine", "")}
      {E.row("Al’s Bar · OH", "destination not registered for Stout", "Review", "w")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Today · brewer",
    job: "Brewer landing: readings due, brew day due, packaging to close",
    reads: "get_today [design; brewer role filter]", writes: "—",
    states: [["empty", "Nothing due · record a reading below"], ["role hidden", "no picks or receipts"]],
    spec: "Reading opens the Fermentation reading sheet defaulted to the overdue vessel. Brew day and packaging rows open their Work frames. Warehouse picks never appear here.",
    body: today(<>
      {E.btns(["Reading", "Brew day"], "c2")}
      {E.row("FV3 · Stout", "reading overdue 31 h", "Reading", "w")}
      {E.row("B-0416 · Hazy IPA v4", "brew day Fri 9/4 · 15 bbl", "Start")}
      {E.row("RUN-0031 · Hazy cans", "packaged today · close due", "Close", "w")}
      {E.row("FV1 · Pils", "1.9 °P · read 4 h ago", "")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Today · driver",
    job: "Driver landing: the next stop and nothing else",
    reads: "get_today [design; delivery rows require route.driver_user_id = caller or admin]", writes: "—",
    states: [["empty", "No route today"], ["offline", "stop list cached · Delivered waits", 1], ["permission", "warehouse membership + assigned route", 1]],
    spec: "Resume opens Driver · confirm delivery for the next incomplete stop. No Pick/Receive rows. The route itself is Work → Route and loading.",
    body: today(<>
      {E.btn("Resume · Stop 1 of 3")}
      {E.row("Stop 1 · Sly Fox Tap Room", "4 Hazy halves · 6 Pils cases", "Resume", "w")}
      {E.row("Stop 2 · Al’s Bar", "2 Stout sixths", "after")}
      {E.row("Stop 3 · Teresa’s", "8 Hazy halves · 12 Pils cases", "after")}
      {E.row("Route A", "departed 8:10 · return open", "")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Today · taproom",
    job: "Bartender landing: what needs swapping, counting or mapping",
    reads: "get_today [design; taproom role filter]", writes: "—",
    states: [["empty", "Nothing due · swap a keg below"], ["role hidden", "no picks, no orders, no invoices", 1], ["narrow surface", "tap board and POS reconcile, nothing else"]],
    spec: "The taproom role maps to a shift rather than a function: a bartender needs the tap board and POS reconciliation and nothing else. The unmapped-item row is here because it silently blocks reconcile.",
    body: today(<>
      {E.btns(["Swap keg", "Weekly count"], "c2")}
      {E.row("Tap 5 · Pils", "nearly out · ~9% left", "Swap", "w")}
      {E.row("Weekly count", "due Thu · last counted 7 days ago", "Count")}
      {E.row("Guest cider", "rung in Square · not mapped, blocks reconcile", "Map", "w")}
      {E.row("Variance · last week", "−0.5 bbl Hazy unaccounted", "Review")}
      {E.note("No picks, orders or invoices — the taproom role sees the taproom.")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Beer", name: "Beer", job: "Inventory, cellar, materials and kegs",
    reads: "get_beer_overview [design; one read across slices]", writes: "—",
    body: (<>
      {E.hd("Beer")}
      {E.nav("Finished goods", "2 shortages · ATP by SKU")}
      {E.nav("Taproom", "2 below par · weekly count due")}
      {E.nav("Cellar", "6 vessels · 1 reading overdue")}
      {E.nav("Materials", "3 shortages")}
      {E.nav("Kegs", "142 out · 9 overdue")}
      {E.blank("Each summary opens its dedicated area; this page does not expand indefinitely.")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Work", name: "Work", job: "Everything currently in motion, ordered by next due action",
    reads: "list_work [design; role default + remembered explicit filter]", writes: "—",
    spec: "Warehouse default rows shown; the full chip set stays visible and an explicit chip choice is remembered. Rows sort by urgency/due time, not newest activity.",
    body: (<>
      {E.hd("Work", "warehouse default")}
      {E.btn("New order", "g")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 1)}
      {E.row("ORD-0231 · Sly Fox", "submitted · ships today", "Confirm")}
      {E.row("ORD-0229 · Al’s Bar", "picked · restock 3 Pils staged", "Put back", "w")}
      {E.row("PO-0142 · Country Malt", "due today", "Receive")}
      {E.row("Route A", "3 stops · Thu", "Resume")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "More", name: "More", job: "Setup and desk review, never standing work",
    reads: "— [role navigation manifest]", writes: "—",
    spec: "Role-filtered; hidden entries leave no gaps. Standing work remains in Today, Beer or Work.",
    body: (<>
      {E.hd("More")}
      {E.nav("Invoices", "QBO mapping and push")}
      {E.nav("Catalog · price lists")}
      {E.nav("Customers · ship-tos")}
      {E.nav("Recipes · compliance")}
      {E.nav("Planning")}
      {E.nav("Settings", "team · locations · import · integrations")}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Global search", job: "Search every permitted entity kind",
    reads: "search_entities [design]", writes: "—", hd: E.hd("Back · Search", "Close"),
    states: [["empty", "No matches · change the term"], ["permission", "Results honor row access"]],
    body: (<>
      {E.inp("Search SKU, customer, order, lot, vessel or material")}
      {E.nav("Hazy IPA · ½ bbl", "SKU · ATP 11")}
      {E.nav("ORD-0231 · Sly Fox", "order · 4 × Hazy")}
      {E.nav("L-240831-HZ", "lot · packaged 8/31")}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Me", job: "Who I am, which brewery, leave",
    reads: "supabase_auth_get_session [platform] · get_first_run_state [design; membership list]", writes: "supabase_auth_sign_out [platform]",
    hd: E.hd("Me", "Close"),
    states: [["dedicated mode", "switcher hidden · one brewery"], ["single membership", "switcher hidden"]],
    spec: "Opened from the header Me control. Brewery switcher renders only in SaaS mode with more than one membership. No notification history, no settings — those live under More.",
    body: (<>
      {E.fld("Signed in as", "maria@demobrewing.com")}
      {E.fld("Role", "warehouse")}
      {E.ttl("Brewery")}
      {E.row("Demo Brewing", "current", "✓", "ok")}
      {E.row("Sly Fox Contract Brewing", "switch", "")}
      {E.sp()}
      {E.btn("Sign out", "g")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "More", name: "Settings", job: "Edit brewery/location basics and route to rare setup",
    reads: "list_locations · list_team_members", writes: "update_brewery · update_location [design; mutable single rows]",
    spec: "Invoices remains a first-class More and desk-rail destination. TTB registry number and PA license are brewery columns and feed the compliance report header. Deployment mode is read-only. Team opens the Team frame.",
    body: (<>
      {E.hd("Back · More", "Settings")}
      {E.fld("Brewery name", "Demo Brewing")}
      {E.fld("Timezone", "America/New_York")}
      {E.fld("TTB registry number", "BR-PA-12345")}
      {E.fld("PA license", "G-1234")}
      {E.fld("Deployment", "dedicated · read-only")}
      {E.btn("Save brewery")}
      {E.fld("Selected location", "Warehouse · warehouse")}
      {E.btns([["Add location", "g"], ["Save location", "p"]])}
      {E.nav("Team", "3 members · 1 pending invite")}
      {E.nav("Accounting", "QuickBooks · connection and push defaults")}
      {E.nav("Point of sale", "Square · catalog and sales")}
      {E.nav("Import", "CSV wizard")}
    </>),
  },
];
