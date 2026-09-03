// components/mgr/screens.tsx — the screen inventory and the source of truth
// for what each MGR screen shows (plan §4, §7); /design renders it. Every
// record is typed; `states` is annotation the gallery captions under the
// frame, never markup inside it. Bodies use only the E vocabulary. Edit the
// records here directly — the HTML wireframe is retired for MGR-venue frames
// and kept only for the Slack/QuickBooks/Square venue drawings.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark, SlackMark, SquareMark } from "@/components/mgr/brand-icons";
import { S, sqItemFilters, sqTxnHead, X, type Venue } from "@/components/mgr/venue";
import { MgrIcon } from "@/components/mgr-icon";
import {
  BeerIcon, DeliveryTruck01Icon, Package01Icon, Route01Icon, Tag01Icon, TaskDone01Icon, ThermometerIcon, WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons";

export type Tab = "Today" | "Beer" | "Work" | "More";
export type Screen = {
  step: number;
  slice: "all" | "chat" | number;
  /** Staff tab the frame lives under; a Global sheet sets `group` instead. */
  tab?: Tab;
  group?: "Global" | "Entry" | "Portal" | "Desk" | "Chat" | "POS" | "QuickBooks Online";
  /** Portal tab, for PortalShell frames. */
  portal?: "Order" | "Orders" | "Invoices" | "Account";
  /** Default page; `sheet` and `entry` frames render as a panel over the shell. */
  surface?: "page" | "sheet" | "entry";
  name: string;
  job: ReactNode;
  reads: ReactNode;
  writes: ReactNode;
  states?: [string, string, (0 | 1)?][];
  spec?: ReactNode;
  /** The drawing replaced an earlier one and `spec` explains why; the docs fold it. */
  redrawn?: true;
  /** Drawn inside another product (QuickBooks, Square, Slack) in that product's
   * own chrome; the body then speaks `X`/`S`, not `E`. See ./venue.tsx. */
  venue?: Venue;
  /** Entry-screen header (mark + product name); sheets take their title from `name`. */
  hd?: ReactNode;
  body: ReactNode;
};

/** The section a screen files under: a venue frame under its product, a
 * portal screen under Portal, otherwise its group or tab. */
export const area = (s: Screen) => s.venue?.name ?? s.group ?? (s.portal ? "Portal" : (s.tab ?? "Other"));

const today = (rows: ReactNode) => (
  <>
    {E.hd("Today", "Thu 9/3")}
    {rows}
  </>
);

const INV = {
  no: "INV-1042",
  order: "ORD-0231",
  customer: "Ridgeline Tap Room",
  invoiceDate: "9/03/2026",
  due: "10/03/2026",
  dueShort: "10/03",
  total: "$948.00",
  major: "948",
  cents: "00",
  hazyPrice: "$150.00",
  hazyAmount: "$600.00",
  pilsPrice: "$38.00",
  pilsAmount: "$228.00",
  depositAmount: "$120.00",
  credit: "$106.00",
  creditMajor: "106",
  fee: "$9.48",
} as const;

export const SCREENS: Screen[] = [
  // step 1 — foundations and both authenticated shells
  {
    step: 1, slice: "all", tab: "Today", name: "Today",
    job: "Role-filtered work that opens ready to finish · full-size exemplar at ship scale",
    reads: "get_today [design; delivery rows require assigned warehouse member or admin]", writes: "none",
    states: [["empty", "Nothing waiting · record below"], ["loading", "row-shaped skeletons"], ["error", "Today did not load · Retry", 1], ["offline", "cached rows · writes queue"], ["role hidden", "only relevant permitted work · no blank gaps"]],
    spec: "Drawn as the warehouse persona at honest 16px density. Rows are role-filtered per plan §3. Pick is the one primary, labelled with the ready count; Receive is outline. The restock row appears while the order's restock flag is set and opens the order. Weekly count is gated: disabled with human copy, never a gate name.",
    body: today(<>
      {E.btns([["Pick · 3 ready", "p"], ["Receive", "g"]], "c2")}
      {E.row("3 orders ready", "quantities default to ordered", E.act("Pick"), "w", Package01Icon)}
      {E.row("Staged · ORD-0229", "restock 3 Pils cases to Warehouse", E.act("Put back"), "w", Package01Icon)}
      {E.row("PO-0142 · Country Malt", "arrives Thu", E.act("Receive"), "", DeliveryTruck01Icon)}
      {E.row("Next delivery · Ridgeline", "your route · stop 1 of 3", E.act("Resume"), "", Route01Icon)}
      {E.gated("Weekly count")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Sales",
    job: "Sales landing: submitted orders to confirm and beer that is short",
    reads: "get_today [design; sales role filter] · get_shortfalls [design]", writes: "none",
    states: [["empty", "Nothing to confirm · new order below"], ["role hidden", "no Pick/Receive; no blank gaps"]],
    spec: "The same Today read as the exemplar, filtered for sales. Confirm opens Order · confirm (2 taps); shortfall rows open Shortfall, pars and standing allocation.",
    body: today(<>
      {E.btns(["Confirm", "New order"], "c2")}
      {E.row("ORD-0231 · Ridgeline", "submitted · ships Thu", E.act("Confirm"), "w", Package01Icon)}
      {E.row("ORD-0235 · Teresa’s", "submitted · ships Fri", E.act("Confirm"), "", Package01Icon)}
      {E.row("Pils · 16 oz case", "Not enough Pils for 2 orders", E.act("Choose who gets it"), "w")}
      {E.row("Hazy IPA · ½ bbl", "11 ready · fine", "")}
      {E.row("Al’s Bar · OH", "Al’s Bar can’t receive Stout in OH", E.act("Fix registration"), "w")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Brewer",
    job: "Brewer landing: readings due, brew day due, packaging to close",
    reads: "get_today [design; brewer role filter]", writes: "none",
    states: [["empty", "Nothing due · record a reading below"], ["role hidden", "no picks or receipts"]],
    spec: "Reading opens the Fermentation reading sheet defaulted to the overdue vessel. Brew day and packaging rows open their Work frames. Warehouse picks never appear here.",
    body: today(<>
      {E.btns(["Reading", "Start"], "c2")}
      {E.row("FV3 · Stout", "reading overdue 31 h", E.act("Reading"), "w", ThermometerIcon)}
      {E.row("B-0416 · Hazy IPA v4", "brew day Fri 9/4 · 15 bbl", E.act("Start"), "", BeerIcon)}
      {E.row("RUN-0031 · Hazy cans", "packaged today · close due", E.act("Close"), "w", Package01Icon)}
      {E.row("FV1 · Pils", "1.9 °P · read 4 h ago", "", "", ThermometerIcon)}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Driver",
    job: "Driver landing: the next stop and nothing else",
    reads: "get_today [design; delivery rows require route.driver_user_id = caller or admin]", writes: "none",
    states: [["empty", "No route today"], ["offline", "stop list cached · Delivered waits", 1], ["permission", "warehouse membership + assigned route", 1]],
    spec: "Resume opens Confirm delivery for the next incomplete stop. Route A opens Driver route (all stops, the load, Return). No Pick/Receive rows.",
    body: today(<>
      {E.btn("Resume · Stop 1 of 3")}
      {E.row("Stop 1 · Ridgeline Tap Room", "4 Hazy halves · 6 Pils cases", "next", "w")}
      {E.row("Stop 2 · Al’s Bar", "2 Stout sixths · later")}
      {E.row("Stop 3 · Teresa’s", "8 Hazy halves · 12 Pils cases · later")}
      {E.nav("Route A", "departed 8:10 · return open")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Today", name: "Taproom",
    job: "Bartender landing: what needs swapping, counting or mapping",
    reads: "get_today [design; taproom role filter]", writes: "none",
    states: [["empty", "Nothing due · swap a keg below"], ["role hidden", "no picks, no orders, no invoices", 1], ["narrow surface", "tap board and POS reconcile, nothing else"]],
    spec: "The taproom role maps to a shift rather than a function: a bartender needs the tap board and POS reconciliation and nothing else. The unmapped-item row is here because it silently blocks reconcile.",
    body: today(<>
      {E.btn("Swap keg")}
      {E.row("Tap 5 · Pils", "nearly out · ~9% left", E.act("Swap"), "w", BeerIcon)}
      {E.gated("Weekly count", "isn’t available yet; the count cannot be saved yet")}
      {E.row("Guest cider", "rung in Square · not mapped, blocks reconcile", "unmapped", "w", Tag01Icon)}
      {E.row("Variance · last week", "−0.5 bbl Hazy unaccounted", E.act("Review"), "", TaskDone01Icon)}
      {E.note("No picks, orders or invoices: the taproom role sees the taproom.")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Beer", name: "Beer", job: "Inventory, cellar, materials and kegs",
    reads: "get_beer_overview [design; one read across slices]", writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.hd("Beer")}
      {E.nav("Finished goods", "2 shortages · ATP by SKU")}
      {E.nav("Taproom", "2 below par · weekly count due")}
      {E.nav("Taps", "11 pouring · Tap board")}
      {E.nav("Cellar", "6 vessels · 1 reading overdue")}
      {E.nav("Materials", "3 shortages")}
      {E.nav("Kegs", "142 out · 9 overdue")}
      {E.blank("Each summary opens its dedicated area; this page does not expand indefinitely.")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "Work", name: "Work", job: "Everything currently in motion, ordered by next due action",
    reads: "list_work [design; role default + remembered explicit filter]", writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Warehouse default rows shown; the full chip set stays visible and an explicit chip choice is remembered. Rows sort by urgency/due time, not newest activity.",
    body: (<>
      {E.hd("Work", "warehouse default")}
      {E.btn("New order", "g")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 1)}
      {E.row("ORD-0231 · Ridgeline", "submitted · ships today", E.act("Confirm"), "", Package01Icon)}
      {E.row("ORD-0229 · Al’s Bar", "picked · restock 3 Pils staged", E.act("Put back"), "w", Package01Icon)}
      {E.row("PO-0142 · Country Malt", "due today", E.act("Receive"), "", DeliveryTruck01Icon)}
      {E.row("Route A", "3 stops · Thu", E.act("Resume"), "", Route01Icon)}
    </>),
  },
  {
    step: 1, slice: "all", tab: "More", name: "More", job: "Setup and desk review, never standing work",
    reads: "none [role navigation manifest]", writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Role-filtered; hidden entries leave no gaps. Standing work remains in Today, Beer or Work.",
    body: (<>
      {E.hd("More")}
      {E.nav("Invoices", "QuickBooks Online mapping and push", "", QuickBooksMark)}
      {E.nav("Catalog", "brands and SKUs")}
      {E.nav("Price tiers", "customer price lists")}
      {E.nav("Customers", "accounts and ship-tos")}
      {E.nav("Recipes", "formulas and versions")}
      {E.nav("Compliance months", "reports and filing status")}
      {E.nav("Vendors", "suppliers")}
      {E.nav("Sale channels", "tax treatment")}
      {E.nav("Formats", "package composition")}
      {E.nav("Planning")}
      {E.nav("Settings", "brewery and integrations")}
      {E.nav("Locations", "warehouses, taprooms and bins")}
      {E.nav("Bins", "physical subdivisions by location")}
      {E.nav("Chat", "Slack and notifications")}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Search", job: "Search every permitted entity kind",
    reads: "search_entities [design]", writes: "none",
    states: [["empty", "No matches · change the term"], ["loading", "row-shaped skeletons"], ["offline", "cached matches only", 1], ["permission", "Results honor row access"]],
    body: (<>
      {E.inp("Search")}
      {E.chips(["all", "SKU", "order", "lot"], 0)}
      {E.nav("Hazy IPA · ½ bbl", "SKU · ATP 11", "", BeerIcon)}
      {E.nav("ORD-0231 · Ridgeline", "order · 4 × Hazy", "", Package01Icon)}
      {E.nav("L-240831-HZ", "lot · packaged 8/31", "", TaskDone01Icon)}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Me", job: "Who I am, which brewery, leave",
    reads: "supabase_auth_get_session [platform] · get_first_run_state [design; membership list]", writes: "supabase_auth_sign_out [platform]",
    states: [["dedicated mode", "switcher hidden · one brewery"], ["single membership", "switcher hidden"]],
    spec: "Opened from the header Me control. Brewery switcher renders only in SaaS mode with more than one membership. No notification history, no settings; those live under More.",
    body: (<>
      {E.fld("Signed in as", "maria@demobrewing.com")}
      {E.fld("Role", "warehouse")}
      {E.ttl("Brewery")}
      {E.row("Demo Brewing", "current", "✓", "ok")}
      {E.row("Ridgeline Contract Brewing", "", E.act("Switch"))}
      {E.sp()}
      {E.btn("Sign out", "irr")}
    </>),
  },
  {
    step: 1, slice: "all", tab: "More", name: "Settings", job: "Edit brewery/location basics and route to rare setup",
    reads: "list_locations · list_team_members", writes: "update_brewery · update_location [design; mutable single rows]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Invoices remains a first-class More and desk-rail destination. TTB registry number and PA license are brewery columns and feed the compliance report header. Deployment mode is read-only. Team opens the Team frame.",
    body: (<>
      {E.back("More", "Settings")}
      {E.fld("Brewery name", "Demo Brewing")}
      {E.fld("Timezone", "America/New_York")}
      {E.fld("TTB registry number", "BR-PA-12345")}
      {E.fld("PA license", "G-1234")}
      {E.fld("Deployment", "dedicated · read-only")}
      {E.btn("Save brewery")}
      {E.nav("Locations", "Warehouse · Taproom")}
      {E.nav("Team", "3 members · 1 pending invite")}
      {E.nav("Accounting", "QuickBooks · connection and push defaults", "", QuickBooksMark)}
      {E.nav("Point of sale", "Square · catalog and sales", "", SquareMark)}
      {E.nav("Import", "CSV wizard")}
    </>),
  },
  {
    step: 8,
    slice: "all",
    tab: "More",
    name: "Locations",
    job: "List brewery locations and create the next one",
    reads: "list_locations",
    writes: "create_location [design]",
    states: [["active", "inventory and work may use it"], ["empty", "Add location is the only action"]],
    spec: "Settings links here instead of editing whichever location happened to be selected.",
    body: (<>
      {E.back("Settings", "Locations")}
      {E.btn("Add location")}
      {E.row("Warehouse", "warehouse · 186 inventory units", E.act("Edit"))}
      {E.row("Taproom", "taproom · 11 taps · 2 bins", E.act("Edit"))}
    </>),
  },
  {
    step: 8,
    slice: "all",
    tab: "More",
    name: "Location detail",
    job: "Edit one location and open its physical bins",
    reads: "list_locations",
    writes: "update_location [design]",
    states: [["warehouse", "fulfillment source"], ["taproom", "POS and taps may map here"], ["in use", "type changes preserve history"]],
    spec: "Location facts stay separate from bins, which are their own list.",
    body: (<>
      {E.back("Locations", "Taproom")}
      {E.inp("Location name · Taproom")}
      {E.pick("Type", "Taproom")}
      {E.fld("Timezone", "Brewery default · America/New_York")}
      {E.nav("Location bins", "Default · Walk-in · To-go fridge")}
      {E.btn("Save location")}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", name: "Permission denied",
    job: "A forbidden route says what was refused and offers one way back",
    reads: "none [the denied query never runs]", writes: "none",
    states: [["bookmarked", "direct URL · denied, not empty rows", 1], ["revoked mid-session", "the next command is refused; the shell stays usable", 1]],
    spec: "Plan §3: navigation and Today hide inapplicable actions while the registry and RLS still deny direct URLs and commands, so this frame exists for the URL, not for a link. It names the refusal and the role that would satisfy it, never a blank table, a spinner, or the shape of data the caller may not read.",
    body: (<>
      {E.back("Today", "No access")}
      {E.note("You do not have access to Invoices.")}
      {E.fld("Signed in as", "dave@ · brewer")}
      {E.fld("Needs", "admin or sales")}
      {E.info("An admin can change your role in Settings › Team.")}
      {E.btns([["Back to Today", "p"], ["Go to Beer", "g"]])}
      {E.sp()}
    </>),
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "No membership",
    job: "Signed in, but this account is not on any brewery or customer",
    reads: "none", writes: "none",
    states: [["no brewery", "ask an admin for an invite"], ["no customer", "the brewery invites portal buyers"]],
    spec: "After sign-in with no brewery and no customer account. The queue is empty because nothing was writable.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("No brewery yet")}
      {E.note("This login is not on a brewery or a customer account.")}
      {E.info("Ask an admin to send an invite.")}
      {E.btn("Sign out", "g")}
      {E.sp()}
    </>),
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired invite",
    job: "The invite link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "ask for a new invite"], ["wrong audience", "a customer link used on staff, or the reverse", 1], ["already a member", "sign in instead"]],
    spec: "Plan §5b. A used or timed-out token never opens Accept invite.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Invite expired")}
      {E.note("This invite is no longer valid.")}
      {E.info("Ask an admin to send a new one.")}
      {E.btn("Back to sign in")}
      {E.sp()}
    </>),
  },
  {
    step: 2, slice: 1, group: "Entry", surface: "entry", name: "Expired reset",
    job: "The password reset link is no longer valid",
    reads: "none", writes: "none",
    states: [["expired", "request a new reset link"]],
    spec: "A timed-out recovery token never opens Set new password.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Reset link expired")}
      {E.note("This reset link is no longer valid.")}
      {E.btn("Request a new link")}
      {E.sp()}
    </>),
  },
  {
    step: 4, slice: 1, group: "Global", surface: "sheet", name: "Session expired",
    job: "Sign in again; queued writes stay in the outbox",
    reads: "local_outbox [client state]", writes: "none",
    states: [["queue kept", "3 writes waiting"], ["signed in", "Retry 1 waiting on the outbox"]],
    spec: "Mid-write expiry does not drop the outbox. Sign in, then Offline outbox still has the queued envelopes.",
    body: (<>
      {E.note("Your session ended. The 3 queued writes are still here.")}
      {E.row("Record movement · Hazy", "waiting", "queued", "", WifiDisconnected01Icon)}
      {E.btn("Sign in to retry")}
    </>),
  },
  // steps 2–8
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Sign in",
    job: "Enter through the Supabase Auth platform boundary",
    reads: "none",
    writes: "supabase_auth_sign_in_with_password · supabase_auth_sign_in_with_otp [platform]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Sign in")}
      {E.inp("email")}
      {E.inp("password")}
      {E.btn("Sign in")}
      {E.btn("Email me a link", "g")}
      {E.act("Forgot password?")}
      {E.sp()}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Accept invite",
    job: "Set a password and land in the correct shell",
    reads: "supabase_auth_get_session [platform]",
    writes: "supabase_auth_update_user [platform; membership already exists]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Staff lands on Today; a customer lands on portal Order. The token decides; the person never chooses a shell. Name is collected here. Expired, wrong-audience and already-a-member are their own landings.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Join Demo Brewing")}
      {E.row("Role", "", "warehouse")}
      {E.inp("Your name")}
      {E.inp("Choose a password")}
      {E.btn("Join Demo Brewing")}
      {E.sp()}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Reset password",
    job: "Recover access without account enumeration",
    reads: "none",
    writes: "supabase_auth_reset_password_for_email [platform]",
    states: [["sent", "Check your email"], ["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["error", "Did not load · Retry", 1]],
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Reset password")}
      {E.inp("email")}
      {E.btn("Send reset link")}
      {E.sp()}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Set new password",
    job: "Recovery-token landing; distinct from joining a brewery",
    reads: "supabase_auth_get_session [platform; recovery token]",
    writes: "supabase_auth_update_user [platform; membership unchanged]",
    states: [["expired link", "Request a new reset link", 1], ["wrong audience", "portal user lands in the portal shell"]],
    spec: "The recovery token opens this, never Accept invite: no role row, no “Join” copy. After Save the existing membership decides the shell.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Set new password")}
      {E.fld("Account", "maria@demobrewing.com")}
      {E.inp("Choose a password")}
      {E.btn("Save password")}
      {E.sp()}
    </>),
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal sign in",
    job: "A wholesale buyer enters through the same Auth boundary",
    reads: "none",
    writes: "supabase_auth_sign_in_with_password [platform]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Customer-only accounts land on Order. Forgot password is a text link, not a second primary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Sign in to your account")}
      {E.inp("email")}
      {E.inp("password")}
      {E.btn("Sign in")}
      {E.row("Forgot password?")}
      {E.sp()}
    </>),
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal forgot password",
    job: "Recover a buyer login without saying whether the email exists",
    reads: "none",
    writes: "supabase_auth_reset_password_for_email [platform]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "The sent state is this same screen with the info. Enumeration is never confirmed.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Reset password")}
      {E.inp("email")}
      {E.btn("Send reset link")}
      {E.info("If that email is on an account, a reset link is on its way.")}
      {E.sp()}
    </>),
  },
  {
    step: 6,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Portal set password",
    job: "Recovery-token landing for a buyer; lands in the portal",
    reads: "supabase_auth_get_session [platform; recovery token]",
    writes: "supabase_auth_update_user [platform]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "After Save, a customer membership opens Order, not Today.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Set new password")}
      {E.fld("Account", "buyer@ridgeline.example")}
      {E.inp("Choose a password")}
      {E.btn("Save password")}
      {E.sp()}
    </>),
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    name: "Team",
    job: "Roster, roles, pending invites and revocation",
    reads: "list_team_members",
    writes: "update_staff_role [design; single row] · revoke_staff [design; single membership row ends] · invite_staff [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI] · the taproom role [SCHEMA-GATE: revision 2 §16.13/§16.16 q4: staff_role gains taproom, but P-staff is role-agnostic, so the narrow per-role policies are undesigned]",
    states: [["last admin", "role change refused · keep one admin", 1], ["pending", "invite sent · not yet accepted"], ["permission", "admin only", 1]],
    spec: "From Settings. Role chips change the member's role in one write; Remove is copper and ends the membership (Auth user untouched; re-invite is the compensation). The invite stays disabled with the same human copy as first run until its gate closes.",
    body: (<>
      {E.back("Settings", "Team")}
      {E.nav("Maria Alvarez", "maria@ · warehouse")}
      {E.nav("Dave Chen", "dave@ · brewer")}
      {E.row("Ted", "ted@ · admin", "you")}
      {E.row("sam@demobrewing.com", "invited Tue · pending", "", "w")}
      {E.gated("Invite staff", "isn’t available yet; invitations are being made retry-safe")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Team member",
    job: "Change one member's role or remove that membership",
    reads: "list_team_members",
    writes: "update_staff_role · revoke_staff [design]",
    states: [["member", "role can change"], ["last admin", "remove and role change refused", 1], ["self", "remove refused", 1]],
    spec: "The destructive action belongs to the named member, so there is no ambiguous selected-member state.",
    body: (<>
      {E.ttl("Maria Alvarez")}
      {E.fld("Email", "maria@demobrewing.com")}
      {E.pick("Role", "Warehouse")}
      {E.btn("Save role")}
      {E.note("Removing Maria ends this brewery membership. Her sign-in account remains.")}
      {E.btn("Remove Maria", "irr")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Create brewery",
    job: "Provision tenant and first owner atomically",
    reads: "none [deployment mode gate]",
    writes: "provision_brewery [design; one RPC: brewery + owner membership]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Hidden in dedicated mode; this is the pre-brewery provisioning boundary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.ttl("New brewery")}
      {E.inp("Brewery name")}
      {E.pick("Timezone", "America/New_York")}
      {E.inp("TTB registry number · optional")}
      {E.btn("Create brewery")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    tab: "Today",
    name: "First-run checklist",
    job: "Turn an empty brewery into usable truth",
    reads: "get_first_run_state [design]",
    writes: "create_location · invite_staff [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Replaces Today until complete; app and portal shells already exist. Each step is one command: add a location, import a CSV, add a brand, invite staff, record a movement. The invite is drawn disabled with the same human copy as the Team frame until the invite workflow gate closes; the step can be skipped.",
    body: (<>
      {E.hd("Set up Demo Brewing", "4 steps")}
      {E.row("1 · Add locations", "inline form expanded", "in progress", "ok")}
      {E.fld("Location name", "Warehouse")}
      {E.chips(["warehouse", "taproom"])}
      {E.btn("Add location")}
      {E.btn("Add another location", "g")}
      {E.row("2 · Import CSV", "or add a brand one at a time", E.act("Import CSV"))}
      {E.row("3 · Invite the team", "email and role", E.act("Skip"))}
      {E.fld("Invite email · role", "name@brewery.com · warehouse")}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.gated("Send staff invite", "isn’t available yet; invitations are being made retry-safe")}
      {E.row("4 · Opening inventory", "count what’s on hand today", E.act("Record opening count"))}
    </>),
  },
  {
    step: 3,
    slice: 1,
    group: "Desk",
    name: "Import",
    job: "Upload, map, preview and independently commit valid rows",
    reads: "list_skus · list_locations · list_customers [design]",
    writes: "import_csv [existing ID; IMPLEMENTATION-GATE: one RPC per dependent logical row + durable requestId/result]",
    states: [["all invalid", "Commit disabled · fix mapping", 1], ["mixed", "2 ready · 1 blocked"], ["rerun target", "After gate, same requestId returns result"], ["permission", "Import requires admin", 1]],
    spec: "Commit controls stay disabled until dependent rows are atomic and opening balances cannot duplicate on rerun. Ship colors: customer/catalog rows green; append-only opening balances copper.",
    body: (<>
      {E.back("Settings", "Import")}
      {E.stp(["upload", "map", "preview", "commit"], 2)}
      {E.chips(["customers", "catalog", "opening balances"], 0)}
      {E.tbl(["row", "record", "match", "state"], [["1", "Ridgeline + Main", "new", "ready"], ["2", "Al’s Bar", "ship-to missing", <><span className="text-warning-foreground">blocked</span></>], ["3", "Teresa’s", "existing", "skip"]])}
      {E.btns([["Import 2 customer rows", "p disabled"], ["Post opening balances", "irr disabled"]])}
    </>),
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "Finished goods",
    job: "See sellable beer by SKU and act on shortages",
    reads: "get_on_hand · get_atp",
    writes: "none [SKU creation happens on its own surface]",
    states: [["short", "ATP below zero links to the competing orders"], ["empty", "no finished goods yet: Add SKU is the only action"]],
    spec: "The Beer landing's Finished goods row opens this list. On-hand, allocated and ATP stay together on each SKU; Review opens SKU detail and a shortage opens the shortfall. Add SKU opens the existing product and SKU flow.",
    body: (<>
      {E.back("Beer", "Finished goods")}
      {E.btn("Add SKU")}
      {E.row("Hazy IPA · ½ bbl keg", "15 on hand · 4 allocated · ATP 11", E.act("Review"))}
      {E.row("Pils · 16 oz case", "18 on hand · 24 allocated · ATP −6", E.act("Shortfall"), "w")}
      {E.row("Stout · ⅙ bbl keg", "9 on hand · 2 allocated · ATP 7", E.act("Review"))}
    </>),
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "SKU detail",
    job: "See on-hand, ATP and immutable tape together",
    reads: "get_on_hand · get_atp · list_movements",
    writes: "reverse_inventory_movement [SCHEMA-GATE: auditable link + valid sign and TTB semantics]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Correction is not actionable yet: opposite-sign rows fail movement CHECKs; enable only after a structured reversal link and reporting semantics exist.",
    body: (<>
      {E.back("Finished goods", "Hazy IPA · ½ bbl")}
      {E.num("11", "ATP · 15 on hand · 4 allocated")}
      {E.row("Warehouse", "", "12")}
      {E.row("Taproom", "", "3")}
      {E.tape([["+8 production in · Warehouse", "Mon"], ["−4 taproom transfer", "Tue"], ["−1 depletion · Taproom", "Wed"]])}
      {E.btn("Record movement")}
      {E.gated("Reverse a movement")}
    </>),
  },
  {
    step: 3,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Record movement",
    job: "Enter a positive amount; server derives direction and barrels",
    reads: "list_skus · list_locations · get_atp",
    writes: "record_movement [existing; one append-only inventory movement]",
    states: [["offline", "Queue with requestId"], ["stale", "ATP changed · preview again", 1], ["permission", "Role cannot record here", 1], ["echo", "Committed row · correction waits for schema gate"]],
    spec: "The server derives sign and 0.50000000 bbl; the client never supplies either. Drawn with festival removal selected: sample and festival removal leave the premises and require a destination state (the schema enforces it); destruction, loss and depletion never carry one. Channel stays.",
    body: (<>
      {E.chips(["add finished goods", "depletion", "loss", "sample", "festival removal", "destruction", "adjustment"], 4)}
      {E.pick("SKU / package", "Hazy IPA · ½ bbl keg")}
      {E.pick("Location", "Warehouse")}
      {E.pick("Channel", "taproom")}
      {E.pick("Destination state", "PA · where the beer is poured")}
      {E.num("1", "keg · amounts are entered positive")}
      {E.info("Preview: −1 keg · 0.50 bbl · festival removal · PA")}
      {E.chips(["keg", "case", "bbl"])}
      {E.pin(<>
        {E.pad()}
        {E.btn("Record movement", "irr")}
      </>)}
    </>),
  },
  {
    step: 3,
    slice: 1,
    tab: "Beer",
    name: "Movement recorded",
    job: "Echo the immutable row and name the correction",
    reads: "list_movements",
    writes: "none",
    states: [["echo", "the tape is the record"], ["correction gated", "Record inventory correction waits on its schema"]],
    spec: "Post-commit of Record movement. A tape means recorded. The named correction is Record inventory correction, not Undo.",
    body: (<>
      {E.back("Beer", "Hazy IPA · ½ bbl")}
      {E.tape([["−1 keg · festival removal · PA", "0.50 bbl · just now"]])}
      {E.gated("Record inventory correction")}
    </>),
  },
  {
    step: 3,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Entity picker",
    job: "Recents first, then one registered search",
    reads: "search_entities · list_skus",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "48px rows; visible keyboard focus; one registered search behind the field.",
    body: (<>
      {E.inp("Search")}
      {E.ttl("Recent")}
      {E.row("Hazy IPA · ½ bbl keg", "11 ready")}
      {E.row("Pils · 16 oz case", "6 short", "", "w")}
      {E.row("Stout · ⅙ bbl keg", "7 ready")}
      {E.ttl("All SKUs")}
      {E.blank("A–Z")}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer proposal",
    job: "Candidate language becomes canonical server preview; signed effect leads",
    reads: "preview_command [design; internal query, not an AI tool]",
    writes: "record_movement [Commit; same requestId + previewToken; server revalidates]",
    states: [["ambiguous", "One question · choice chips · no Commit button", 1], ["stale", "Reject and preview current data", 1], ["permission", "No proposal beyond allowed role", 1], ["offline", "Save candidate; no fake preview"]],
    spec: "Ambiguity (“half” = ½ bbl keg, or half the remaining ⅙?) renders a question with choice chips and no Commit; this frame is the resolved proposal after that choice. The preview query is internal, never an AI tool.",
    body: (<>
      {E.hd("Composer", "proposal")}
      {E.row("“Blew a half of Hazy at the taproom”")}
      {E.num("−1 × Hazy IPA · ½ bbl keg", "Taproom · depletion · −0.5 bbl")}
      {E.pick("SKU / package", "Hazy IPA · ½ bbl keg")}
      {E.pick("Location", "Taproom")}
      {E.pick("Type", "Depletion")}
      {E.info("Document numbers are assigned on commit.")}
      {E.sp()}
      {E.btns([["Open as form", "g"], ["Commit movement", "irr"]])}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer question",
    job: "One question, chips, no Commit until the SKU is chosen",
    reads: "preview_command [design; internal query, not an AI tool]",
    writes: "none",
    states: [["ambiguous", "choice chips · no Commit"], ["resolved", "opens Composer proposal"]],
    spec: "Named in Composer proposal states and never drawn until now. “Blew a half of Hazy” must pick the package before a Commit exists.",
    body: (<>
      {E.hd("Composer", "question")}
      {E.row("“Blew a half of Hazy at the taproom”")}
      {E.ttl("Which half?")}
      {E.chips(["½ bbl keg", "half the remaining ⅙"], -1)}
      {E.info("The verb stays off until this is answered.")}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer answer",
    job: "Questions use named registered queries",
    reads: "get_atp · get_shortfalls [design]",
    writes: "none",
    states: [["loading", "answer skeleton"], ["error", "Could not refresh ATP · Retry", 1], ["offline", "cached value + timestamp"]],
    spec: "History is a visible control in the composer strip; no swipe-only interaction.",
    body: (<>
      {E.hd("Composer", "answer")}
      {E.row("“How much Hazy can I promise Friday?”")}
      {E.num("11 × ½ bbl", "plus 40 cases · 2 orders compete for 6")}
      {E.row("Shortfall detail", "who competes for the 6", E.act("Review"))}
    </>),
  },
  {
    step: 4,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Offline outbox",
    job: "Retry safely; separate response loss from permanent rejection",
    reads: "local_outbox [client state]",
    writes: "none [client replays envelope’s exact registered command with same requestId; confirmed discard is local]",
    states: [["response lost", "Server dedupe returns prior result"], ["permanent", "Open form; preserve fields", 1], ["session expired", "Sign in; keep queue"], ["permission changed", "Do not replay; explain", 1]],
    spec: "The discard confirmation names every queued write; response loss resolves by requestId and shows the prior result.",
    body: (<>
      {E.row("Record movement · Hazy", "waiting for wifi", E.act("Retry"), "", WifiDisconnected01Icon)}
      {E.row("Record fermentation reading · FV3", "response lost", E.act("Check"), "", WifiDisconnected01Icon)}
      {E.row("Record cellar transfer · FV2", "validation failed", E.act("Fix"), "w", WifiDisconnected01Icon)}
      {E.btn("Retry 1 waiting")}
      {E.note("Discard asks you to confirm. These 3 unsent writes are deleted.")}
      {E.btn("Discard 3 queued writes", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Orders",
    job: "Find every order by state and take its next valid action",
    reads: "list_orders",
    writes: "none [creation and state changes happen on their own surfaces]",
    states: [["filtered", "one state chip selected"], ["empty", "no orders in this state: New order stays available"]],
    spec: "The Work list with the orders chip active. Rows cover the active order states and name the next valid action; New order opens the order-entry sheet. Order and Confirm order return here.",
    body: (<>
      {E.hd("Work", "sales default")}
      {E.btn("New order")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 1)}
      {E.chips(["all states", "draft", "submitted", "confirmed", "picked", "shipped"], 0)}
      {E.row("ORD-0231 · Ridgeline", "submitted · ships Thu", E.act("Confirm"))}
      {E.row("ORD-0229 · Al’s Bar", "picked · restock 3 Pils staged", E.act("Put back"), "w")}
      {E.row("ORD-0234 · Teresa’s", "confirmed · ships Fri", E.act("Pick"))}
      {E.row("ORD-0235 · Teresa’s", "draft · ships Fri", E.act("Finish"))}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Confirm order",
    job: "Confirm a submitted order in two taps from Today",
    reads: "get_order · get_atp",
    writes: "confirm_order [design; one RPC: status + allocations] · cancel_order [design; one RPC: terminal status + allocation release]",
    states: [["loading", "order-shaped skeleton"], ["stale", "line changed · refresh", 1], ["permission", "sales or admin required", 1], ["cancelled", "staged quantities become restock work"]],
    spec: "2 taps from Today: Confirm → Confirm order, only when no blocking review exists. The registration warning is the same one the Order screen shows; it links to the Compliance registry and never blocks.",
    body: (<>
      {E.back("Orders", "ORD-0231")}
      {E.ttl("Ridgeline Tap Room")}
      {E.row("Current state", "Submitted · ships Thu", E.act("Next: confirm"))}
      {E.pick("Fulfillment source", "Warehouse")}
      {E.info("Lifecycle: submitted → confirmed → picked → shipped. Only the valid next action is active.")}
      {E.row("Hazy IPA · ½ bbl keg", "", "4 · ATP 11")}
      {E.row("Pils · 16 oz case", "", "10 · ATP −6", "w")}
      {E.note("ATP is −6. Confirming oversells; that stays your call.")}
      {E.note("Stout isn’t registered for Ohio. Check the Compliance registry ›")}
      {E.sp()}
      {E.btns([["Confirm order", "p"], ["Cancel order", "irr"]])}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Order",
    job: "The staff home for one order: state, next action, lines, events, restock",
    reads: "get_order · get_atp",
    writes: "submit_order [design; draft → submitted] · adjust_order_line [design; one RPC: line + allocation; sets needs_restock on a picked order] · confirm_order [design; one RPC] · cancel_order [design; one RPC: terminal status + allocation release]",
    states: [["draft", "Submit is the one active verb"], ["confirmed / picked", "lines adjust; restock rows appear when picked qty exceeds ordered"], ["shipped", "read-only tape · Return shipment is the correction"], ["stale", "another user changed a line · refresh", 1], ["permission", "sales or admin to adjust; warehouse reads", 1]],
    spec: "Drawn as picked after a line was adjusted down: staged 3 Pils cases must go back to Warehouse; there is no restock write; re-picking or shipping clears the restock flag on the order. Ship opens Ship and invoice rather than committing here. Cancel is ghost and asks for confirm. Every transition appends an order event row in the same RPC. Confirm still has its own two-tap Today frame.",
    body: (<>
      {E.back("Orders", "ORD-0229")}
      {E.ttl("Al’s Bar · Columbus, OH")}
      {E.row("Current state", "Picked · restock pending", E.act("Next: ship"))}
      {E.fld("Fulfillment source", "Warehouse")}
      {E.fld("Customer PO", "4471")}
      {E.note("Put back 3 Pils cases to Warehouse. They stayed staged after the line was adjusted.")}
      {E.row("Hazy IPA · ½ bbl keg", "ordered 4 · picked 4", E.act("ATP 11"), "ok")}
      {E.row("Pils · 16 oz case", "ordered 7 · picked 10", "adjust", "w")}
      {E.row("Stout · ⅙ bbl keg", "ordered 2 · picked 2", E.act("ATP 7"), "ok")}
      {E.btns([["Adjust line", "g"], ["Add line", "g"]])}
      {E.note("Stout isn’t registered for Ohio. Check the Compliance registry ›")}
      {E.tape([["created · Ted", "Mon 9:02"], ["submitted · Ted", "Mon 9:05"], ["confirmed · Maria", "Mon 14:10"], ["picked · Dave · 4 / 10 / 2", "Tue 8:40"], ["line adjusted · Pils 10 → 7 · customer cut", "Tue 9:15"]])}
      {E.btns([["Ship", "p"], ["Cancel order", "ghost"]])}
      {E.info("Cancel asks you to confirm. Allocations release.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Short pick",
    job: "Resolve one short line before the pick can finish",
    reads: "get_order",
    writes: "resolve_short_pick [design; one RPC: short_reason + chosen resolution (line qty + allocation) + order_events row]",
    states: [["adjust down", "ordered 10 → 7 · allocation shrinks · ATP recovers"], ["keep staged", "7 staged · 3 remain owed · order stays confirmed"], ["stale", "another picker changed this line · recheck", 1], ["offline", "resolution waits for live ATP", 1]],
    spec: "Opens from a Pick line whose count is below ordered. Reason is required; exactly one resolution is chosen and the verb names it: adjusting the order is green (mutable order edit); keeping the remainder staged is also green. The restock implication is copy in the preview, never a status column. Done picking completes afterward on the Pick frame.",
    body: (<>
      {E.back("Pick", "ORD-0231 · short line")}
      {E.fld("Order · source", "Ridgeline · Warehouse")}
      {E.row("Pils · 16 oz case", "ordered 10", E.stq(7), "w")}
      {E.nav("Reason", "required", "w")}
      {E.ttl("Resolve the missing 3")}
      {E.chips(["Adjust order to 7", "Keep 3 owed · staged"], 0)}
      {E.info("Preview: order line 10 → 7. Customer sees “adjusted”.")}
      {E.sp()}
      {E.btn("Adjust order to 7 cases")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pick",
    job: "Default lines to ordered; touch only exceptions",
    reads: "get_order",
    writes: "record_pick [design; one RPC: every qty_picked + picked status] · resolve_short_pick [design; one RPC]",
    states: [["short pick", "a line below ordered opens the Short pick frame", 1], ["concurrent", "another picker changed qty"], ["cancelled", "staged · restock now", 1], ["offline", "queue whole pick set once"]],
    spec: "2 taps from Today: Pick → Done picking (all-as-ordered only). Shortage is not a chip here: entering a count below ordered opens Short pick.",
    body: (<>
      {E.back("ORD-0231", "Pick · Warehouse")}
      {E.info("From Warehouse · lines start at ordered; touch only exceptions.")}
      {E.row("Hazy IPA · ½ bbl keg", "ordered 4", E.stq(4), "ok")}
      {E.row("Pils · 16 oz case", "ordered 10", E.stq(10), "ok")}
      {E.row("Stout · ⅙ bbl keg", "ordered 2", E.stq(2), "ok")}
      {E.btn("Print pick sheet", "g")}
      {E.sp()}
      {E.btn("Done picking")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Put back",
    job: "Confirm staged quantities were re-shelved after a restock",
    reads: "get_order [design; restock flag and staged qtys]",
    writes: "none [re-picking or shipping clears the restock flag; there is no restock write]",
    states: [["pending", "Today Put back is the standing row"], ["done", "flag cleared · row leaves Today"]],
    spec: "Today’s Put back row opens this. Staged 3 Pils cases after ORD-0229 was adjusted down. Confirming they are back on the shelf is the verb; inventory already sits in Warehouse as staged.",
    body: (<>
      {E.back("Today", "ORD-0229 · put back")}
      {E.note("3 Pils cases stayed staged after the line was adjusted. Put them back on the Warehouse shelf.")}
      {E.row("Pils · 16 oz case", "staged after pick", "3", "w")}
      {E.sp()}
      {E.btn("Put back 3 cases")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship and invoice",
    job: "Default wholesale ship: commit removal and the invoice together",
    reads: "get_order",
    writes: "ship_order [design; one RPC: shipment (carrier/tracking optional) + per-line qty_shipped + sale_removal movements with dest_state from ship-to + allocation fulfillment/release + shipped status + invoice with lines; invoice timing = now persisted with the shipment]",
    states: [["stale", "picked qty changed · preview again", 1], ["short ship", "qty below picked needs a reason; remainder is released", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["accepted", "INV number on commit · restock row if qty short"]],
    spec: <>Ship qty prefills from picked and is editable per line; a shortage reason appears only when qty &lt; picked. Carrier/tracking never block the commit. The preview names the destination state from the ship-to and says the invoice number is assigned on commit. On-delivery timing lives on Ship · confirmation; taproom transfers use Complete transfer.</>,
    body: (<>
      {E.back("ORD-0231", "Ship")}
      {E.pick("Fulfillment source", "Warehouse")}
      {E.row("Hazy IPA · ½ bbl keg", "picked 4", E.stq(4), "ok")}
      {E.row("Pils · 16 oz case", "picked 10", E.stq(9), "w")}
      {E.nav("Reason", "required", "w")}
      {E.inp("Carrier · tracking · optional")}
      {E.chips(["Invoice now", "On delivery"], 0)}
      {E.tape([["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"], ["−9 Pils cases · sale removal · PA", "0.42 bbl"], ["1 Pils case released · restock", ""], ["invoice number", "assigned on commit"]])}
      {E.sp()}
      {E.btn("Ship order", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Shipment done",
    job: "The invoice number after a ship, and the named correction",
    reads: "get_order · get_invoice [design]",
    writes: "none",
    states: [["accepted", "INV number on the tape"], ["short", "restock row on Today"]],
    spec: "Post-commit of Ship and invoice. A tape means recorded. Return shipment is the correction.",
    body: (<>
      {E.back("ORD-0231", "Shipped")}
      {E.fld("Invoice", "INV-0241 · assigned")}
      {E.tape([["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"], ["−9 Pils cases · sale removal · PA", "0.42 bbl"], ["INV-0241", "invoiced now"]])}
      {E.info("To correct this shipment, Return shipment.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship on delivery",
    job: "The On delivery state of Ship and invoice",
    reads: "get_order",
    writes: "ship_order [SCHEMA-GATE: persist explicit on-delivery invoice timing on the shipment; then the same one RPC without the invoice; confirm_delivery invoices later]",
    states: [["stale", "picked qty changed · preview", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["schema gate", "deferred mode cannot persist yet", 1]],
    spec: "Folded into Ship and invoice as the On delivery chip. Same fields as Invoice now; the commit stays disabled until invoice timing can be saved. Two screens both titled Ship was confusing.",
    body: (<>
      {E.back("ORD-0231", "Ship")}
      {E.pick("Fulfillment source", "Warehouse")}
      {E.row("Hazy IPA · ½ bbl keg", "picked 4", E.stq(4), "ok")}
      {E.row("Pils · 16 oz case", "picked 10", E.stq(10), "ok")}
      {E.chips(["Invoice now", "On delivery"], 1)}
      {E.tape([["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"], ["−10 Pils cases · sale removal · PA", "0.47 bbl"], ["invoice number", "deferred to delivery"]])}
      {E.note("Shipping on delivery isn’t available yet; invoice timing can’t be saved. Choose Invoice now to ship today.")}
      {E.sp()}
      {E.btn("Ship order", "irr disabled")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Complete transfer",
    job: "Finish a taproom transfer order: same movements, no invoice",
    reads: "get_order",
    writes: "ship_order [design; taproom_transfer kind: one RPC: shipment + paired taproom_transfer movements (−source, +destination) + allocation fulfillment + shipped status; no invoice]",
    states: [["stale", "picked qty changed · preview again", 1], ["short", "qty below picked releases the remainder"], ["permission", "warehouse or admin required", 1], ["accepted", "taproom on-hand rises immediately"]],
    spec: "No invoice-timing chip and no destination state: beer moves between the brewery’s own locations. Copper because the paired movements are append-only. Requested from Taproom · Needs replenishment.",
    body: (<>
      {E.back("TRF-0088", "Complete transfer")}
      {E.fld("From → to", "Warehouse → Taproom")}
      {E.row("Pils · 16 oz case", "move / picked", "4 / 4", "ok")}
      {E.row("Hazy IPA · ½ bbl keg", "move / picked", "2 / 2", "ok")}
      {E.tape([["−4 Pils cases · taproom transfer · Warehouse", "0.19 bbl"], ["+4 Pils cases · taproom transfer · Taproom", "0.19 bbl"], ["−2 / +2 Hazy ½ bbl · taproom transfer", "1.00 bbl"]])}
      {E.info("No invoice: this is an internal move.")}
      {E.sp()}
      {E.btn("Complete transfer", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Pick sheet",
    job: "Group confirmed demand by ship date",
    reads: "get_daily_pick_sheet [design]",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.back("Work", "Pick sheet")}
      {E.chips(["Wed 9/2", "Thu 9/3", "Fri 9/4"], 1)}
      {E.nav("Ridgeline · ORD-0231", "3 lines")}
      {E.nav("Al’s Bar · ORD-0232", "1 line")}
      {E.nav("Teresa’s · ORD-0234", "5 lines")}
      {E.nav("Totals", "Hazy halves 9 · Pils cases 22")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Weekly count",
    job: "Target-state count plus active suggested transfer",
    reads: "get_taproom_count_snapshot [SCHEMA-GATE] · get_taproom_replenishment [design] · list_locations",
    writes: "record_taproom_count [SCHEMA-GATE: durable count + lines + optional movements in one RPC] · create_taproom_transfer [design; one RPC: order with explicit source + destination + lines + allocations]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Count is target-state only and disabled until durable count persistence lands; the taproom lead uses the warehouse permission bundle. INVERTED (this frame was drawn the other way round): the physical count is the source of truth and posts the depletion, connected or not. POS supplies expected consumption and posts nothing, so disconnecting removes the expected column and changes nothing about what the count writes. That is also why a keg moving warehouse → taproom stays on the books as taproom stock: a taproom transfer carries no channel, and the beer leaves only when a count says it is gone, which makes a month-end count yield the month’s removal cleanly. Variance is drawn twice on purpose: inline while someone can still recount, and as a report where a pattern across weeks (one line, one shift) is the only place it becomes legible. Counts are in kegs and cases, so qty never needs fractional widening.",
    body: (<>
      {E.back("Beer", "Taproom")}
      {E.ttl("Weekly count / sales depletion")}
      {E.note("This count posts the depletion. POS sales are the expected number beside it; the gap is what the taproom lost to pours, comps, staff drinks and line cleaning.")}
      {E.row("Pils · 16 oz case", "expected 4", E.stq(4))}
      {E.row("Hazy · ½ bbl keg", "expected 3", E.stq(2), "w")}
      {E.row("Stout · ⅙ bbl keg", "expected 2", E.stq(2))}
      {E.info("Variance −1 Hazy · 0.5 bbl unaccounted. Recording posts 4 Pils + 4 Hazy + 2 Stout depletion; the variance is reported, never posted.")}
      {E.nav("Variance by brand", "four weeks · where the gap keeps showing up")}
      {E.gated("Record count")}
      {E.ttl("Needs replenishment")}
      {E.note("Below par: transfer 4 Pils + 2 Hazy.")}
      {E.fld("Transfer from", "Warehouse · selected")}
      {E.row("Transfer to", "Taproom", E.act("Fixed"))}
      {E.btn("Create transfer order", "g")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Variance by brand",
    job: "Where the gap between poured and counted keeps showing up",
    reads: "get_taproom_variance [design; expected from POS sales, actual from counts]",
    writes: "none",
    states: [["no POS", "no expected number · the report is empty, counts still post", 1], ["one bad week", "noise · a single week is not a pattern"], ["persistent", "same brand every week · the thing worth acting on", 1], ["not in inventory", "tapped outside stock · excluded from every column"]],
    spec: "Variance is drawn twice on purpose. Inline on the count it catches a miscount while someone can still walk back to the shelf; here it answers a different question, whether the gap is noise or a pattern, which a single week can never show. Expected comes from POS sales, actual from the physical count, and the difference is reported and never posted: it is not a movement, it is the explanation for one. The named causes are what a taproom manager actually does something about (bad pours, comps, staff drinks, line cleaning, theft), so the report groups by brand first, because a brand that leaks every week points at one line or one shift. Kegs flagged as not in inventory are excluded from both columns rather than shown as loss.",
    body: (<>
      {E.back("Beer", "Variance")}
      {E.ttl("Variance by brand")}
      {E.chips(["4 weeks", "12 weeks"], 0)}
      {E.tbl(["Brand", "Expected", "Counted", "Variance"], [["Hazy IPA", "11.5 bbl", "11.0 bbl", "−0.5"], ["Pils", "8.0 bbl", "7.9 bbl", "−0.1"], ["Stout", "3.0 bbl", "3.0 bbl", "0.0"]])}
      {E.nav("Hazy IPA", "short 4 weeks running · 1.8 bbl total · −4%")}
      {E.info("A brand short every week points at one line or one shift. A single short week is noise.")}
      {E.note("Reported, never posted. The count already wrote the depletion; this is the explanation for it.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Pars and allocation",
    job: "Change named quantities; never invent priority",
    reads: "get_shortfalls · get_standing_allocations [design]",
    writes: "adjust_order_line [design; one RPC: line + allocation] · release_allocation · set_taproom_par · set_taproom_standing_allocation [design]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "There is no ranking command or priority column; every change is a named quantity edit.",
    body: (<>
      {E.back("Beer", "Pils · 16 oz case")}
      {E.num("−6 cases · −0.58 bbl", "ATP · 22 cases on hand · 28 allocated")}
      {E.row("ORD-0231 · Ridgeline", "10 cases · 0.97 bbl", E.act("Adjust"))}
      {E.row("ORD-0234 · Teresa’s", "12 cases · 1.16 bbl", E.act("Release"))}
      {E.row("Taproom standing", "6 cases · 0.58 bbl", E.act("Edit"))}
      {E.row("Taproom par", "8 cases · 0.77 bbl", E.act("Edit"))}
      {E.btns([["Adjust selected", "p"], ["Edit par", "g"]])}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Return and credit",
    job: "Return beer and correct money atomically",
    reads: "get_order",
    writes: "return_shipment [design; one RPC: return_in movements at explicit destination + credit memo + owned-fleet keg_events linked to shipment when slice 9 is enabled]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.back("ORD-0231", "Beer return")}
      {E.row("Hazy IPA · ½ bbl keg", "shipped 4 · returning", E.stq(1))}
      {E.chips(["damaged", "wrong item", "unsold"])}
      {E.pick("Return to", "Warehouse · original fulfillment source")}
      {E.row("Deposit refund", "½ bbl pool · 1", "−$30.00")}
      {E.tape([["+1 Hazy ½ bbl · return in", "Warehouse"], ["credit memo number · on commit", "−$180.00"]])}
      {E.note("Empty-keg asset returns are a different Keg fleet command.")}
      {E.sp()}
      {E.btn("Return shipment", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "New order",
    job: "Complete customer, source, ship-to and line entry for staff",
    reads: "list_customers · list_locations · list_skus · get_atp",
    writes: "create_order [design; one RPC: draft order + all lines]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Source is required and becomes the order's from-location; the app never guesses “Warehouse.” Save draft lands on the Order screen, where Submit lives.",
    body: (<>
      {E.back("Work", "New order")}
      {E.pick("Customer", "Ridgeline Tap Room")}
      {E.pick("Source location", "Warehouse")}
      {E.pick("Ship-to", "Main · Phoenixville, PA")}
      {E.inp("Customer PO · optional · 4471")}
      {E.pick("Requested ship", "Thu 9/3")}
      {E.row("Hazy IPA · ½ bbl keg", "ATP 11 at Warehouse", E.stq(4))}
      {E.row("Pils · 16 oz case", "ATP −6 at Warehouse", E.stq(10), "w")}
      {E.btn("Add line", "g")}
      {E.info("Order number is assigned on commit.")}
      {E.sp()}
      {E.btn("Save draft")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customers",
    job: "Manage accounts, addresses and portal users",
    reads: "list_customers · get_customer [design]",
    writes: "create_customer · update_customer · create_ship_to · update_ship_to · invite_customer_user [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.back("More", "Customers")}
      {E.inp("Search customers")}
      {E.row("Ridgeline Tap Room", "retailer · PA · 2 portal users", E.act("Open"))}
      {E.row("Al’s Bar", "retailer · OH · brewery remits", E.act("Open"), "w")}
      {E.btn("Add customer")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Customer detail",
    job: "Edit one customer and reach its ship-tos, prices, orders and keg balance",
    reads: "get_customer [design]",
    writes: "update_customer",
    states: [["active", "may place orders"], ["inactive", "history remains"], ["license warning", "renewal needs review", 1]],
    spec: "The list opens a named account; related operational records remain links rather than inline editors.",
    body: (<>
      {E.back("Customers", "Ridgeline Tap Room")}
      {E.inp("Customer name · Ridgeline Tap Room")}
      {E.pick("Type", "Retailer")}
      {E.inp("License number · PA R-55821")}
      {E.pick("Terms", "Net 30")}
      {E.pick("Price list", "Wholesale · standard")}
      {E.nav("Ship-tos", "Main · Dock")}
      {E.row("Portal users", "2 active", E.act("Invite"))}
      {E.nav("Customer keg balance", "38 out · $1,140 deposits held")}
      {E.nav("Orders", "3 open · 42 total")}
      {E.btn("Save customer")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Invite portal user",
    job: "Invite one buyer to a customer account",
    reads: "get_customer [design]",
    writes: "invite_customer_user [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI]",
    states: [["ready", "email is valid"], ["sent", "recipient receives a sign-in link"], ["existing member", "show the existing access instead", 1]],
    body: (<>
      {E.inp("Email · buyer@ridgeline.example")}
      {E.chips(["buyer", "account admin"])}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.gated("Send invite", "isn’t available yet: customer membership hardening comes first")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Ship-to form",
    job: "Create or edit one delivery address for a customer",
    reads: "get_customer [design]",
    writes: "create_ship_to · update_ship_to",
    states: [["new", "address required"], ["existing", "orders keep their frozen destination"], ["default", "new orders select it first"]],
    spec: "Editing an address never rewrites the destination recorded on an existing order.",
    body: (<>
      {E.ttl("Main ship-to")}
      {E.inp("Label · Main")}
      {E.inp("Address · 114 Bridge St")}
      {E.inp("City · Phoenixville")}
      {E.inp("State · PA")}
      {E.inp("Postal code · 19460")}
      {E.row("Default ship-to", "selected first on new orders", E.act("On"), "ok")}
      {E.btn("Save ship-to")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Accounting",
    job: "One page for the QuickBooks connection, and for the three things a pay link needs",
    reads: "get_qbo_connection [design; adds payments_enabled + push defaults]",
    writes: "connect_qbo · disconnect_qbo · set_qbo_push_defaults [design; admin-only]",
    states: [["healthy", "token good; company id shown"], ["expired", "reconnect before mapping or push", 1], ["payments off", "no pay link can be generated for any invoice", 1], ["ACH only", "card disabled; cheaper, and slower to arrive"], ["defaults changed", "applies to the next push, never retroactively"]],
    spec: "Square already had Settings · Point of sale; QuickBooks had nothing, and Settings · Integrations dead-ended. This is the other half. It exists mainly to make three invisible preconditions visible before a customer meets them: QuickBooks Payments must be active on the company, AllowOnlineACHPayment / AllowOnlineCreditCardPayment must ride every push, and the customer must carry an email. Any one missing and Intuit generates no InvoiceLink, so the portal Pay button either never renders or lands on the unavailable page. Payment method is a money decision, not a checkbox: card runs a percentage fee, so on a four-figure keg invoice the method the customer picks is real money; the fee is visible in the QuickBooks Payment sidebar and MGR does not model it. Push defaults live here rather than per invoice, so an invoice cannot be born unpayable by omission.",
    body: (<>
      {E.back("Settings", "Accounting")}
      {E.ttl("QuickBooks")}
      {E.row("Demo Brewing LLC", "authorization expired · company 9341", E.act("Disconnect"), "w")}
      {E.note("QuickBooks authorization expired. Push, payment links and paid-date sync are paused.")}
      {E.btn("Reconnect QuickBooks")}
      {E.row("QuickBooks Payments", "active · card and bank", "", "ok", QuickBooksMark)}
      {E.ttl("Push defaults")}
      {E.info("Every invoice is pushed ready to pay. Turning both off means customers cannot pay online at all.")}
      {E.row("Bank transfer (ACH)", "on · lowest fee", E.act("On"), "ok")}
      {E.row("Card", "on · percentage fee applies", E.act("On"), "ok")}
      {E.row("Customers missing an email", "2 · cannot be pushed", E.act("Review"), "w")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Connect QuickBooks",
    job: "Authorize one QuickBooks company and explain the data exchange before OAuth",
    reads: "none [OAuth returns the selected company]",
    writes: "connect_qbo [design]",
    states: [["cancelled", "return to Accounting unchanged"], ["already connected", "show Mapping conflict", 1]],
    spec: "The disconnected Accounting state. OAuth is an external write, so the button is copper and the page says what MGR will exchange before leaving.",
    body: (<>
      {E.back("Settings", "Connect QuickBooks")}
      {E.info("MGR reads customers, items, invoice status and payments. It creates wholesale invoices and credit memos.")}
      {E.note("QuickBooks remains the accounting record. Connecting does not push existing invoices.")}
      {E.btn("Connect QuickBooks", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Mapping conflict",
    job: "Resolve an ambiguous QuickBooks customer or item without guessing",
    reads: "get_qbo_mapping_candidates [design]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping [design]",
    states: [["customer", "two candidates match"], ["item", "two candidates match"], ["company claimed", "this company is connected to another brewery", 1]],
    spec: "A candidate is chosen explicitly. A company already claimed by another brewery cannot be overridden here.",
    body: (<>
      {E.note("Two QuickBooks customers match Ridgeline Tap Room. Choose the account this brewery invoices.")}
      {E.row("Ridgeline Tap Room", "Phoenixville · active · customer 184", E.act("Use"))}
      {E.row("Ridgeline Holdings", "Phoenixville · active · customer 227", E.act("Use"))}
      {E.info("If this QuickBooks company belongs to another MGR brewery, disconnect it there first.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    surface: "sheet",
    name: "Disconnect QuickBooks",
    job: "Confirm the external effects of disconnecting QuickBooks",
    reads: "get_qbo_connection [design]",
    writes: "disconnect_qbo [design]",
    states: [["confirmed", "connection disabled and tokens purged"]],
    spec: "The confirmation names what stops and what remains so reconnecting can resume without remapping.",
    body: (<>
      {E.note("Stops: invoice push, payment links and paid-date sync.")}
      {E.info("Stays: MGR invoices, QuickBooks ids and customer/item mappings.")}
      {E.btn("Disconnect QuickBooks", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QuickBooks Online",
    name: "Invoice drift",
    job: "What the AR list shows when someone edits, voids or deletes an invoice over there",
    reads: "list_invoices [design; qbo_sync_token + qbo_remote_state]",
    writes: "push_invoice_to_qbo [same requestId] · write_off_invoice [design; MGR status only, never touches QuickBooks]",
    states: [["edited there", "SyncToken changed since MGR pushed", 1], ["voided", "amounts zeroed; this is not payment", 1], ["deleted", "the id points at nothing; sync gets a 404", 1], ["not sent", "pushed but never delivered; only a fault if MGR is not the channel"], ["live", "the ordinary case; no badge at all"]],
    spec: <>QuickBooks has no read-only invoice. Once pushed, the accountant can edit, void or delete it from the Sales transactions sidebar and no API setting prevents that, so MGR detects rather than prevents. QuickBooks hands us the detector free: SyncToken increments on every modification and already rides the response the sync job reads for balance, so drift costs one column and no extra call. The rule this frame protects: <b>a voided invoice is not a paid invoice.</b> Voiding zeroes the amounts, so any logic inferring paid from a QuickBooks balance of zero books cancelled revenue as collected; the database refuses to record a paid date unless the remote state is live, rather than trusting the job to remember. MGR surfaces drift and stops: no re-push that overwrites an accountant’s correction, no field-level merge UI. ASSUMPTION: a drifted invoice stays in AR at QuickBooks’ numbers, because QuickBooks owns the invoice after push.</>,
    body: (<>
      {E.back("More", "Invoices")}
      {E.row(`${INV.no} · Ridgeline`, `due ${INV.dueShort} · ${INV.total} · pushed`, E.act("Open in QuickBooks"))}
      {E.row("INV-1041 · Al’s Bar", "edited in QuickBooks · $980 → $1,040", E.act("Open in QuickBooks"), "w")}
      {E.row("INV-1040 · Teresa’s", "voided in QuickBooks · not paid", E.act("Write off"), "w")}
      {E.row("INV-1039 · Al’s Bar", "deleted in QuickBooks", <>{E.act("Re-push")}{E.act("Write off")}</>, "w")}
      {E.row("INV-1038 · Al’s Bar", "pushed · not emailed yet", E.act("Open in QuickBooks"))}
      {E.row("INV-1037 · Ridgeline", "paid 8/29 from QuickBooks Online", "$980", "ok")}
      {E.info("MGR shows what changed over there. Corrections belong in QuickBooks, or as a credit memo here.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoices",
    job: "An AR list first; connect, map and push are the drill-in for one invoice",
    reads: "list_invoices · get_qbo_connection · get_qbo_mapping_candidates [design]",
    writes: "connect_qbo · set_qbo_customer_mapping · set_qbo_item_mapping · push_invoice_to_qbo [design]",
    states: [["connection health", "QuickBooks · token healthy · company 9341"], ["expired", "Reconnect before mapping or push", 1], ["paid", "the paid date arrives from the QuickBooks Online sync · no user verb"], ["drill-in", "one invoice: mapping candidates + Push"]],
    spec: "List rows carry the due date, push failure and paid date, plus credit-memo QuickBooks status; payments come back through the sync job and are read-only here. Tapping a failed row opens the drill-in drawn below the list: connection, each mapping and push are four independent commands; push is online-only copper and persists exact payload + deterministic requestId before the remote POST. Creating a credit memo stays Return shipment.",
    body: (<>
      {E.back("More", "Invoices")}
      {E.row("QuickBooks", "connected · company 9341", "healthy", "ok", QuickBooksMark)}
      {E.row(`${INV.no} · Ridgeline`, `due ${INV.dueShort} · pushed · ${INV.total}`, E.act("Open"))}
      {E.row("INV-0197 · Al’s Bar", "push failed · item unmapped · $540", E.act("Review"), "w")}
      {E.row("INV-0190 · Ridgeline", "paid 8/29 from QuickBooks Online · $980", E.act("Open"), "ok")}
      {E.row("CM-0012 · Teresa’s", "credit memo · pushed · −$180", E.act("Open"))}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoice",
    job: "Review one invoice, resolve its mappings and push it",
    reads: "get_invoice · get_qbo_connection · get_qbo_mapping_candidates [design]",
    writes: "push_invoice_to_qbo [design]",
    states: [["unmapped", "push stays unavailable", 1], ["ready", "every customer and item is mapped"], ["pushed", "QuickBooks owns later accounting edits"]],
    body: (<>
      {E.back("Invoices", "INV-0197")}
      {E.row("Al’s Bar", "due 10/03 · 3 lines", "$540")}
      {E.row("Customer mapping", "Al’s Bar · customer 227", E.act("Fix"), "ok")}
      {E.row("Pils · case", "QuickBooks item is missing", E.act("Fix"), "w")}
      {E.info("Push becomes available after every customer and item has a QuickBooks match.")}
      {E.btn("Push invoice to QuickBooks Online", "irr disabled")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Fix mapping",
    job: "Choose the QuickBooks record for one invoice customer or item",
    reads: "get_qbo_mapping_candidates [design]",
    writes: "set_qbo_customer_mapping · set_qbo_item_mapping [design]",
    states: [["candidate selected", "save enables invoice push"], ["no match", "create it in QuickBooks first", 1]],
    body: (<>
      {E.row("Pils 16 oz", "QuickBooks item 316 · active", E.act("Select"))}
      {E.row("Pilsner case", "QuickBooks item 402 · active", E.act("Select"))}
      {E.btn("Save mapping")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Catalog",
    job: "Define brands, SKUs, package BOMs and prices without ledger writes",
    reads: "list_brands · list_skus",
    writes: "create_brand · update_brand · create_sku · update_sku · replace_sku_bom [design; one RPC replaces selected SKU full BOM] · create_price_list · update_price_list · set_price_list_item [existing/design]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "BOM replacement is one RPC, never a client row loop. Brand and SKU facts (ABV, tax class, package, barrels per unit) edit on the Brand / SKU frame; this page stays list + BOM + a simple list × SKU price item, never the v1 price matrix.",
    body: (<>
      {E.back("More", "Catalog")}
      {E.nav("Hazy IPA", "IPA · 6.8% · 3 SKUs")}
      {E.nav("Pils", "Lager · 4.9% · 2 SKUs")}
      {E.nav("Stout", "Stout · 7.2% · 1 SKU")}
      {E.btn("Add brand")}
      {E.nav("Price lists", "3 tiers")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Package BOM",
    job: "Replace the packaging materials consumed by one SKU",
    reads: "get_sku · list_materials [design]",
    writes: "replace_sku_bom [design; one RPC replaces the selected SKU full BOM]",
    states: [["complete", "every material has a quantity"], ["empty", "the SKU consumes no tracked packaging"]],
    body: (<>
      {E.pick("SKU", "Hazy IPA · case · 24×16 oz")}
      {E.row("16 oz can", "quantity 24", E.act("Edit"))}
      {E.row("Can end", "quantity 24", E.act("Edit"))}
      {E.row("Case tray", "quantity 1", E.act("Edit"))}
      {E.btn("Replace BOM")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Product",
    job: "Sellable facts without ledger writes, including the TTB fields",
    reads: "list_brands · list_skus",
    writes: "create_brand* · update_brand · create_sku* · update_sku",
    states: [["new brand", "name + style + ABV + tax class"], ["inactive SKU", "hidden from portal; history keeps it"], ["keg SKU", "keg size chip; container source waits for slice 5"]],
    spec: "Barrels per unit is the basis of all TTB math, so it shows as the exact fraction and the decimal the ledger will freeze. The TTB tax class defaults to beer; other classes appear when the brewery sells one. No UPC scan, no container source editor here.",
    body: (<>
      {E.back("Catalog", "Hazy IPA")}
      {E.fld("Brand name", "Hazy IPA")}
      {E.fld("Style · ABV", "IPA · 6.8 %")}
      {E.chips(["beer"], 0)}
      {E.btn("Save brand")}
      {E.nav("SKU list", "3 active packages")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "SKU",
    job: "Create or edit one sellable package under a brand",
    reads: "get_sku",
    writes: "create_sku · update_sku",
    states: [["active", "available to price and sell"], ["inactive", "history remains", 1]],
    body: (<>
      {E.inp("SKU name · ½ bbl keg")}
      {E.chips(["keg", "case", "each"])}
      {E.inp("Units per case · 1")}
      {E.inp("Barrels per unit · 0.50000000")}
      {E.row("Package BOM", "Keg shell · quantity 1", E.act("Edit"))}
      {E.btn("Save SKU")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "SKU list",
    job: "See every package sold under one brand and open its facts",
    reads: "list_skus",
    writes: "none [creation and editing happen on SKU detail]",
    states: [["active", "available to price and sell"], ["inactive", "history remains", 1], ["empty", "Add SKU is the only action"]],
    spec: "Product links here instead of showing an arbitrary one of three SKUs inline.",
    body: (<>
      {E.back("Product", "Hazy IPA · SKUs")}
      {E.btn("Add SKU")}
      {E.row("½ bbl keg", "0.50000000 bbl · active", E.act("Edit"))}
      {E.row("⅙ bbl keg", "0.16666667 bbl · active", E.act("Edit"))}
      {E.row("case · 24×16 oz", "0.09677419 bbl · active", E.act("Edit"))}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    name: "Shop",
    job: "A buyer catalog: price, package, quantity, Place order",
    reads: "get_portal_catalog [SCHEMA/RLS-GATE: return customer-allowed fulfillment source]",
    writes: "submit_order [SCHEMA/RLS-GATE: validate allowed from_location_id; one RPC: order + lines + submitted status]",
    states: [["empty catalog", "call brewery; nothing orderable"], ["missing price", "item cannot enter cart", 1], ["no ship-to", "contact brewery; choose an existing ship-to", 1], ["repeat recheck", "SKU, price, ship-to and source revalidate", 1], ["receipt", "ORD number after commit"]],
    spec: "Target 2 taps: Same as last week → Place order (the repeat proposal opens Review prefilled). Review stays disabled until the schema/RLS contract supplies and validates a customer-allowed source; it never silently chooses Warehouse. Stepper − and + each ship as 48×48 targets. No staff vocabulary (ATP, gates, fulfillment engineering) anywhere in the portal. No persistent cart: leaving the page keeps nothing.",
    body: (<>
      {E.hd("Order", "Ridgeline")}
      {E.btn("Same as last week", "g")}
      {E.row("Hazy IPA · ½ bbl keg", INV.hazyPrice, E.stq(4))}
      {E.row("Pils · 16 oz case", INV.pilsPrice, E.stq(6))}
      {E.row("Stout · ⅙ bbl keg", "$62.00", E.stq(0))}
      {E.row("Ships from", "Warehouse")}
      {E.row("Ship-to · requested date", "Main · Wed 9/9", E.act("Change"))}
      {E.sp()}
      {E.btn("Review order · $828.00", "p disabled")}
      {E.info("Review is unavailable until the brewery sets where your orders ship from.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    surface: "sheet",
    name: "Review order",
    job: "Confirm quantities, ship-to and fulfillment line, then place the order",
    reads: "get_portal_catalog [SCHEMA/RLS-GATE: return customer-allowed fulfillment source]",
    writes: "submit_order [SCHEMA/RLS-GATE: validate allowed from_location_id; one RPC: order + lines + submitted status]",
    states: [["price changed", "revalidated price shown before Place order", 1], ["inactive SKU", "line removed · told plainly", 1], ["submit error", "keep quantities · Retry safe", 1], ["duplicate", "same request returns the same ORD number"]],
    spec: "The confirm step for both the stepper path and Same as last week. Buyer copy only: price, package, quantity, “Ships from Warehouse”, Place order. No ATP, no gate names. Place order stays disabled until the source contract exists. After submit the portal is read-only; changes go through the brewery.",
    body: (<>
      {E.row("Hazy IPA · ½ bbl keg", INV.hazyPrice, E.stq(4, "Hazy IPA quantity"))}
      {E.row("Pils · 16 oz case", INV.pilsPrice, E.stq(6, "Pils quantity"))}
      {E.row("Keg deposit", "4 × $30.00", INV.depositAmount)}
      {E.fld("Subtotal", INV.total)}
      {E.fld("Tax", "$0.00 · sale for resale")}
      {E.fld("Ship-to", "Main · Phoenixville, PA")}
      {E.fld("Requested date", "Wed 9/9")}
      {E.row("Ships from", "Warehouse")}
      {E.fld("Your PO number", "optional")}
      {E.info("Order number is assigned when you place the order.")}
      {E.sp()}
      {E.btn("Place order · $828.00", "p disabled")}
      {E.info("Placing an order isn’t available until the brewery sets where yours ship from.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Orders",
    name: "Order history",
    job: "See status and adjusted quantities without staff controls",
    reads: "list_portal_orders [design]",
    writes: "none",
    states: [["expanded row", "lines with ordered vs shipped and plain adjusted copy"], ["no orders", "Start one from Order"]],
    spec: "A row opens Order detail. Shipped rows offer Reorder. Adjusted quantities are stated in buyer copy. No cancel: the portal is read-only after submit, and the row says whom to call.",
    body: (<>
      {E.hd("Orders", "Ridgeline")}
      {E.nav(INV.order, `confirmed · ships Thu · ${INV.total}`)}
      {E.row("ORD-0225", "shipped 8/27 · $980", E.act("Reorder"))}
      {E.nav("ORD-0221", "adjusted · 2 cases short · $528", "w")}
      {E.info("Need a change? Call Demo Brewing. Orders can’t be edited here after they’re placed.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Orders",
    name: "Order detail",
    job: "One order’s status, lines and the invoice when it exists",
    reads: "portal_order [existing] · portal_invoices [existing]",
    writes: "none",
    states: [["confirmed", "ships date · no invoice yet"], ["adjusted", "lines show ordered vs shipped"], ["shipped", "invoice link · Reorder"], ["delivered", "invoice link · Reorder"]],
    spec: "Opened from Order history. Status is the buyer-facing state. Reorder is on shipped and delivered. The invoice link is absent until the brewery has billed.",
    body: (<>
      {E.back("Orders", "ORD-0225")}
      {E.fld("Status", "Shipped 8/27")}
      {E.fld("Ship-to", "Main · Phoenixville, PA")}
      {E.row("Hazy IPA · ½ bbl keg", "ordered 2 · shipped 2", "$300.00")}
      {E.row("Pils · 16 oz case", "ordered 6 · shipped 6", "$228.00")}
      {E.nav("INV-0190", "paid 8/29 · $980")}
      {E.btn("Reorder", "g")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Pay invoice",
    job: "One stable MGR link that resolves to QuickBooks at the moment it is clicked",
    reads: "get_portal_invoice · get_qbo_connection [design; payments_enabled flag]",
    writes: "none [Intuit takes the payment; paid_at returns through the sync job]",
    states: [["payable", "Pay opens QuickBooks in a new tab"], ["no payments account", "the button never renders; brewery has no QuickBooks Payments", 1], ["not pushed yet", "no QuickBooks invoice id yet; Pay is absent, not disabled"], ["link unavailable", "Intuit returned none: the unavailable page, never a 500", 1], ["already paid", "Pay is gone; the paid date came back from the sync"]],
    spec: "The whole design is one rule: MGR owns the link, Intuit owns the destination. What is shared (this row, the emailed reminder, the PDF footer) is always /portal/invoices/:id/pay, an MGR URL that is permanent because it resolves late. Intuit’s InvoiceLink is read-only, is generated only for a pay-enabled invoice with a customer email, has no documented expiry, and is intermittently absent; fetching it seconds before the redirect makes every one of those someone else’s problem. It is never stored in a column, never serialised to the client, never put in an email. It is a bearer URL (anyone holding it can pay), so authorization runs on every click before any Intuit call is made, and the 404 for a customer requesting somebody else’s invoice must land before the fetch, not after.",
    body: (<>
      {E.back("Invoices", INV.no)}
      {E.ttl(INV.total)}
      {E.row("Due", INV.due)}
      {E.row("Status", "Unpaid", "", "w")}
      {E.tbl(["Item", "Qty", "Amount"], [["Hazy IPA · ½ bbl", "4", INV.hazyAmount], ["Pils · 16 oz case", "6", INV.pilsAmount], ["Keg deposit · NON", "4", INV.depositAmount]])}
      {E.info("Pay by card or bank transfer through QuickBooks. You will not need an account.")}
      {E.btn("Pay invoice")}
      {E.btn("Download PDF", "g")}
      {E.nav("Question this invoice", "sends a note to Demo Brewing")}
      {E.info("Opens QuickBooks in a new tab. This link keeps working; it is re-checked each time you open it.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Payment unavailable",
    job: "The degraded page that replaces a 500 when Intuit returns no link",
    reads: "get_portal_invoice [design]",
    writes: "none",
    states: [["no link", "Intuit generated none for this invoice", 1], ["no customer email", "the cause push should have caught first", 1], ["payments off", "brewery has no QuickBooks Payments account"], ["reason logged", "the customer sees one page; the brewery sees why"]],
    spec: "Exists so that “works every time” is honest rather than aspirational. Every precondition is checked before the share (push refuses an invoice whose customer has no email, and the Payments capability is cached on the connection), but InvoiceLink can still come back empty, so the click path needs a designed floor. The customer gets one coherent page with the invoice still readable and a way to reach a human; MGR logs the distinguishing reason. Never a stack trace, never a dead redirect, never a Pay button that throws.",
    body: (<>
      {E.back("Invoices", INV.no)}
      {E.ttl(INV.total)}
      {E.info("Online payment isn’t available for this invoice right now.")}
      {E.row("Due", INV.due)}
      {E.tbl(["Item", "Qty", "Amount"], [["Hazy IPA · ½ bbl", "4", INV.hazyAmount], ["Pils · 16 oz case", "6", INV.pilsAmount], ["Keg deposit · NON", "4", INV.depositAmount]])}
      {E.note("Contact Demo Brewing to arrange payment. The invoice above is unchanged and still due.")}
      {E.row("Demo Brewing", "(610) 555-0142", "›")}
      {E.nav("Question this invoice", "sends a note to Demo Brewing")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    surface: "sheet",
    name: "Question invoice",
    job: "Ask the brewery about a line, a total or a payment",
    reads: "get_portal_invoice [design]",
    writes: "none [email or chat to the brewery; no portal write]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Off Pay invoice and Payment unavailable. The buyer writes a note; the brewery gets it. Nothing on the invoice changes.",
    body: (<>
      {E.fld("Invoice", "INV-0198 · $1,240.00")}
      {E.inp("What’s wrong with this invoice?")}
      {E.btn("Send to Demo Brewing")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Paid invoice",
    job: "A paid invoice has no Pay; the date and PDF remain",
    reads: "get_portal_invoice [design]",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "The paid date arrived from QuickBooks. Pay is gone. Download PDF is the one action.",
    body: (<>
      {E.back("Invoices", "INV-0190")}
      {E.ttl("$980.00")}
      {E.row("Paid", "8/29/2026", "", "ok")}
      {E.tbl(["Item", "Qty", "Amount"], [["Hazy IPA · ½ bbl", "2", "300.00"], ["Pils · 16 oz case", "6", "228.00"]])}
      {E.btn("Download PDF", "g")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Invoice history",
    job: "See issued, due and paid invoices",
    reads: "list_portal_invoices [design]",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.hd("Invoices", "Ridgeline")}
      {E.row(INV.no, `due ${INV.dueShort}`, INV.total, "w")}
      {E.row("INV-0198", "overdue · due 9/18", E.act("Pay"), "w")}
      {E.row("INV-0190", "paid 8/29", "$980", "ok")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Account",
    name: "Account",
    job: "Read own ship-to, signed-in membership and deposit details",
    reads: "get_portal_account [design]",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Peer portal users are not listed; the composer exposes only account-safe reads and order commands.",
    body: (<>
      {E.hd("Account", "Ridgeline")}
      {E.nav("Main ship-to", "Phoenixville, PA")}
      {E.nav("Dock ship-to", "Royersford, PA")}
      {E.row("You · buyer", "this login", "active")}
      {E.row("Keg deposits held", "38 × ½ bbl", "$1,140")}
      {E.info("Contact the brewery to change account details.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Account",
    surface: "sheet",
    name: "Portal Me",
    job: "Who I am on this customer account, leave, change password",
    reads: "supabase_auth_get_session [platform]",
    writes: "supabase_auth_sign_out [platform]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Opened from the portal header Me control. No brewery switcher. Change password opens Portal set password. Sign out is outline here; the irreversible accent is a staff Me follow-up.",
    body: (<>
      {E.fld("Signed in as", "buyer@ridgeline.example")}
      {E.fld("Account", "Ridgeline Tap Room")}
      {E.btn("Change password", "g")}
      {E.btn("Sign out", "g")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Cellar map",
    job: "Occupancy is the subject: fill, gravity and overdue lead every tile",
    reads: "get_cellar_map [design]",
    writes: "create_vessel · update_vessel [design; mutable single rows] · complete_batch [SCHEMA-GATE: close/reconciliation identity + classifications; one RPC: batch close + occupancy close + automatic reconciliation]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Complete batch stays disabled until close/reconciliation identity exists: the batch’s closing time, the occupancy close and the typed automatic reconciliation must commit atomically. Tile fill derives from occupancy vs vessel capacity, never from a status column. Reading is the one primary; Transfer and Brew day are outline. A tile opens the Vessel sheet to edit facts.",
    body: (<>
      {E.back("Beer", "Cellar")}
      {E.tiles([["FV1", "Pils · 12.8 / 15 bbl", "1.9 °P · read 4 h", 0, 85, 1], ["FV2", "Hazy · 9.0 / 15 bbl", "7.5 °P · read 8 h", 0, 60, 1], ["FV3", "Stout · 13.5 / 15 bbl", "5.2 °P · overdue 31 h", 1, 90, 1], ["BT1", "Pils · 7.0 / 10 bbl", "carbing", 0, 70, 1], ["BT2", "Empty · 0 / 10 bbl", "available", 0, 0, 1], ["FB1", "Saison · 0.4 / 1 bbl", "aging · read 1 d", 0, 40, 1]], 2)}
      {E.btns([["Reading", "p"], ["Transfer", "g"], ["Brew day", "g"]], "c3")}
      {E.nav("FV3 · fermenter · 15 bbl", "occupancy, readings and vessel facts")}
      {E.btn("Add vessel", "g")}
      {E.gated("Complete batch")}
      {E.sp()}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Beer",
    name: "Vessel detail",
    job: "Inspect one vessel's occupancy and readings and edit its physical facts",
    reads: "get_vessel · list_fermentation_readings [design]",
    writes: "update_vessel [design; mutable facts only]",
    states: [["occupied", "batch and fill shown"], ["empty", "available for a batch"], ["reading overdue", "last reading flagged", 1]],
    spec: "Batch occupancy and reading history are records; only the vessel name, type and capacity are editable here.",
    body: (<>
      {E.back("Cellar map", "FV3")}
      {E.row("Stout · BATCH-0168", "13.5 / 15 bbl · 90% full", E.act("Open batch"), "w")}
      {E.fld("Current reading", "5.2 °P · 68.2 °F · overdue 31 h")}
      {E.ttl("Reading history")}
      {E.row("9/02 · 7:10 AM", "5.2 °P · 68.2 °F", "Dana")}
      {E.row("9/01 · 7:04 AM", "6.8 °P · 67.9 °F", "Ali")}
      {E.row("8/31 · 6:58 AM", "8.6 °P · 67.5 °F", "Dana")}
      {E.ttl("Vessel facts")}
      {E.inp("Name · FV3")}
      {E.pick("Type", "Fermenter")}
      {E.inp("Capacity · 15 bbl")}
      {E.btn("Save vessel")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Fermentation reading",
    job: "Record any values taken; SG converts to stored Plato",
    reads: "get_cellar_map [design; occupancy + last reading]",
    writes: "record_fermentation_reading [design; mutable reading row]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "One reading may contain gravity, temperature, pH, or any combination. Blank values remain absent; prior values are reference only, never silently copied. The pad fills the highlighted field; Gravity is the default.",
    body: (<>
      {E.row("Gravity", "1.019 SG · prior 1.021", "on pad", "w")}
      {E.fld("Temperature", "68.2 °F · prior 67.8")}
      {E.fld("pH", "blank · prior 4.21")}
      {E.chips(["SG", "°P"], 0)}
      {E.info("Enter only values taken now; blanks are not rewritten.")}
      {E.inp("Note · optional")}
      {E.pin(<>
        {E.pad()}
        {E.btn("Record reading")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar addition",
    job: "Post-knockout dry hop, fruit or adjunct against an occupancy",
    reads: "get_cellar_map [design; open occupancies] · get_recipe [design; the version’s post-knockout stages]",
    writes: "record_batch_addition [design; one RPC: batch_additions row (stage, occupancy) + material consumption movement; lot required when the material is lot-tracked]",
    states: [["no lot", "Choose a lot · Citra is lot-tracked", 1], ["recipe hint", "planned dry hop 1.2 lb/bbl · 18 lb"], ["offline", "queue with requestId"], ["stale", "occupancy closed · choose another", 1]],
    spec: "Not Record movement (that is finished goods) and not Brew day (that is knockout). The consumption movement carries the lot; the addition row carries stage and occupancy so loss accounting stays anchored to the batch.",
    body: (<>
      {E.pick("Occupancy", "FV2 · B-0416 · Hazy IPA")}
      {E.pick("Material", "Citra · hop")}
      {E.chips(["dry hop", "fermentation", "other"], 0)}
      {E.num("18", "lb · lot L-0790 · 262 on hand")}
      {E.chips(["lb", "oz", "kg"])}
      {E.info("Preview: −18 lb Citra · L-0790 · consumption · dry hop · B-0416")}
      {E.pin(<>
        {E.pad()}
        {E.btn("Record addition", "irr")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Batches",
    job: "See planned and active batches with the next brew or cellar action",
    reads: "list_batches [design]",
    writes: "none [scheduling happens on Schedule batch; recording on Brew day]",
    states: [["planned", "Start is the next action"], ["active", "the row names the next reading or transfer"], ["empty", "no batches yet: New batch is the only action"]],
    spec: "The Work list with the batches chip active. Planned batches sort before active batches due for attention; every row names its next action. New batch opens Schedule batch, and Schedule batch and Brew day return here.",
    body: (<>
      {E.hd("Work", "brewer default")}
      {E.btn("New batch")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 2)}
      {E.ttl("Planned")}
      {E.row("B-0416 · Hazy IPA v4", "Fri 9/4 · 15 bbl", E.act("Start"))}
      {E.ttl("Active")}
      {E.row("B-0409 · Pils", "FV1 · 1.9 °P · read 4 h ago", E.act("Reading"))}
      {E.row("B-0412 · Stout", "FV3 · reading overdue 31 h", E.act("Reading"), "w")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Schedule batch",
    job: "Set recipe, date and planned barrels before brew day",
    reads: "get_brew_day [design]",
    writes: "schedule_batch [design; single planned-batch row]",
    states: [["planned", "Save schedule is the one verb"], ["brew day", "Record brew day is its own screen"]],
    spec: "The planned mode of brew day: recipe, date and planned barrels. Record brew day is a separate screen so this page has one primary.",
    body: (<>
      {E.back("Batches", "B-0416 · Hazy")}
      {E.pick("Recipe", "Hazy IPA v4")}
      {E.pick("Date · planned", "Fri 9/4 · 15 bbl")}
      {E.sp()}
      {E.btn("Save schedule")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew day",
    job: "Consume actual lots and set knockout baseline",
    reads: "get_brew_day [design]",
    writes: "record_brew_day [design; one RPC: additions + material movements + occupancy]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Brew-day mode: actual lots and knockout vessel. Planned recipe/date/barrels live on Schedule batch so this page has one primary. Record brew day posts immutable material consumption for mash/boil/whirlpool stages only; the 18 lb Citra dry hop is posted later from Cellar addition. Yeast is consumed as a material lot, not a culture generation (plan §8).",
    body: (<>
      {E.back("Batches", "B-0416 · Hazy")}
      {E.nav("2-row", "lot L-0821 · 660 lb")}
      {E.nav("Citra · boil", "lot L-0790 · 6 lb")}
      {E.nav("Yeast", "WLP066 · lot Y-0312 · 1 brink")}
      {E.fld("Knockout baseline", "14.6 bbl → FV2")}
      {E.tape([["Start B-0416 · Hazy IPA v4", ""], ["Consume additions", "named material lots"], ["Knockout 14.6 bbl → FV2", "loss baseline"]])}
      {E.sp()}
      {E.btn("Record brew day", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Cellar transfer",
    job: "Write one transfer row that carries its own loss volume",
    reads: "get_cellar_map [design; occupancy volumes]",
    writes: "record_cellar_transfer [design; one RPC: create target occupancy(initial_bbl=0) when empty + append transfer(loss_bbl) + close source occupancy iff fully emptied]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Drawn as a blend into an occupied brite: BT1 keeps its occupancy and B-0412 keeps its identity: the schema has one batch per occupancy, and blends are transfers into the surviving one (renaming a blend as a new batch is a plan §8 schema gap). An empty target (BT2) gets a new occupancy starting at zero bbl in the same RPC; the transfer row stays immutable; a fully emptied source closes its occupancy. A partial transfer never implies loss: the person explicitly holds the remainder or records loss. No vessel status.",
    body: (<>
      {E.pick("From", "FV1 · Pils · B-0409 · 12.8 bbl")}
      {E.pick("To", "BT1 · Pils · B-0412 · 7.0 / 10 bbl")}
      {E.num("3.0", "bbl moving")}
      {E.info("Blend preview: BT1 7.0 + 3.0 = 10.0 bbl (full) · stays B-0412 · Pils. FV1 keeps 9.8 bbl.")}
      {E.fld("Remainder in FV1", "9.8 bbl")}
      {E.chips(["Leave in FV1", "Record as loss"], 0)}
      {E.pin(<>
        {E.pad()}
        {E.btn("Record transfer", "irr")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Close packaging run",
    job: "Plan a run separately, then create lot and movements on close",
    reads: "get_packaging_run [design; revalidate selected source occupancy] · list_locations",
    writes: "schedule_packaging_run [design; one RPC: run with explicit source occupancy + planned outputs] · close_packaging_run [design; one RPC: revalidate source + close + lot + outputs + material movements at explicit locations]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "The close half of the packaging frame; planning and editing the plan live in the Schedule packaging run sheet, reached from the Plan row until the run starts. Close is a copper review ( revalidated source, actual outputs, lot, explicit FG destination, material consumption/return/damage, yield/loss). Print labels is presentation after commit: measured thermal keg-collar/lot labels per plan §3. No packaging-day-actuals screen.",
    body: (<>
      {E.back("Work", "RUN-0031 · started")}
      {E.fld("Packaging source", "FV3 · B-0416")}
      {E.tbl(["need", "have", "short"], [["cans 2,880", "3,100", "0"], ["ends 2,880", "2,400", <><span className="text-warning-foreground">480</span></>], ["labels 2,880", "5,000", "0"]])}
      {E.note("480 ends short · resolve or explicitly override before starting.")}
      {E.fld("Packaged", "118 cases")}
      {E.pick("Lot", "L-240905-HZ")}
      {E.pick("Finished goods destination", "Warehouse · selected")}
      {E.tape([["FV3 · B-0416", "source checked"], ["+118 cases · production in", "Warehouse · new lot"], ["−2,832 cans + ends · consumption", "FIFO"], ["Labels returned / damaged", "24 / 6"], ["Beer loss · 0.30 bbl", "yield 97.9%"]])}
      {E.btn("Close packaging run", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Run closed",
    job: "Lot and labels after close; Print is the post-commit action",
    reads: "get_packaging_run [design]",
    writes: "none",
    states: [["closed", "lot assigned · labels ready"], ["print", "keg collar and lot labels"]],
    spec: "Post-commit of Close packaging run. Print labels moves here; the close verb is gone.",
    body: (<>
      {E.back("Work", "RUN-0031 · closed")}
      {E.fld("Lot", "L-240905-HZ")}
      {E.fld("Output", "118 cases · Warehouse")}
      {E.fld("Yield", "97.9% · 0.30 bbl loss")}
      {E.btn("Print labels")}
    </>),
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    name: "Packaging runs",
    job: "See what is planned, what is due and what closed, and schedule the next run",
    reads: "list_packaging_runs [design; planned and recent closed, by planned date] · get_material_shortfalls [design; per planned run]",
    writes: "none [scheduling and closing happen on their own surfaces]",
    states: [["short", "a planned run whose materials fall short says so on the row and its next action is Resolve, not Start"], ["due today", "the same row also appears in Today for the brewer"], ["closed", "recent runs stay for a few weeks with lot, output and yield; after that they are history under Search and Lot trace"], ["empty", "no runs planned: the button is the only thing on the page"]],
    spec: "The Work list with the runs chip active, which is the packaging list: Work is where everything in motion lives, so runs get no rail entry of their own. Upcoming sorts by planned date and every row names its next action. Recent breaks Work's in-motion rule on purpose, because a brewer plans the next run against the last one's yield; it is kept short and the full history stays in Search. Schedule run opens the sheet; a row opens the run, where closing happens.",
    body: (<>
      {E.hd("Work", "brewer default")}
      {E.btn("Schedule run")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 3)}
      {E.ttl("Upcoming")}
      {E.row("RUN-0031 · Hazy cans", "Fri 9/5 · FV3 · 118 cases planned · 480 ends short", E.act("Resolve"), "w")}
      {E.row("RUN-0032 · Pils ½ bbl", "Tue 9/9 · FV1 · 40 kegs planned", E.act("Start"))}
      {E.row("RUN-0033 · Stout cans", "Thu 9/11 · no source yet", E.act("Pick source"))}
      {E.ttl("Recent")}
      {E.row("RUN-0030 · Pils cans", "closed Tue 9/2 · L-240902-PL · 96 cases · 97% yield", "", "ok")}
      {E.row("RUN-0029 · Hazy ½ bbl", "closed Fri 8/29 · L-240829-HZ · 38 kegs · 95% yield", "", "ok")}
      {E.row("RUN-0028 · Helles cans", "closed Wed 8/27 · L-240827-HL · 110 cases · 92% yield · 2 bbl loss", "", "w")}
      {E.info("Recent keeps the last few weeks. Older runs are under Search and Lot trace.")}
    </>),
  },
  {
    step: 8,
    slice: 5,
    tab: "Work",
    surface: "sheet",
    name: "Schedule packaging run",
    job: "Plan a run against one source occupancy and see shortages before the day",
    reads: "list_occupancies [design; open, with volume and contents] · list_formats [design; for the brand in the source] · get_material_shortfalls [design; preview for the planned outputs]",
    writes: "schedule_packaging_run [design; one RPC: run with explicit source occupancy + planned outputs] · update_packaging_run [design; same sheet reopens a planned run until it starts]",
    states: [["source chosen", "the brand comes from what is in the vessel, so only that brand's formats are offered"], ["short", "the materials table shows the shortage now, not on the day; Save still works, Start will not"], ["editing", "a planned run reopens here with its values filled; a started run cannot be rescheduled, only closed"], ["no open occupancy", "nothing to package: the source picker says so and links to Cellar"]],
    spec: "The plan half of the packaging frame, pulled out so a run can be scheduled before it exists and edited until it starts. One source occupancy, chosen exactly, is the rule that lets close revalidate it later. Planned outputs are counts per format; the sheet converts to barrels and shows what is left in the vessel so a plan cannot exceed the source. Materials are previewed from the format BOM so a shortage is a planning fact, not a surprise at the line. Saving writes the run and its planned outputs in one RPC and lands on the run; nothing moves in the ledger until close.",
    body: (<>
      {E.pick("Planned date", "Fri 9/5")}
      {E.ttl("Source")}
      {E.nav("FV3 · Hazy IPA", "B-0416 · 42.0 bbl · gravity 2.1 · ready")}
      {E.ttl("Planned outputs")}
      {E.row("Hazy · cans (case of 24)", "39.6 bbl", E.stq(118))}
      {E.row("Hazy · ½ bbl keg", "2.0 bbl", E.stq(4))}
      {E.fld("Left in FV3", "0.4 bbl · loss at close unless held")}
      {E.ttl("Materials")}
      {E.tbl(["need", "have", "short"], [["cans 2,832", "3,100", "0"], ["ends 2,832", "2,400", <><span className="text-warning-foreground">432</span></>], ["labels 2,832", "5,000", "0"], ["trays 118", "140", "0"]])}
      {E.note("432 ends short. Save the plan now; Start stays disabled until the shortage is resolved or overridden on the run.")}
      {E.btn("Save run plan")}
      {E.info("Nothing moves until the run closes. Saving writes the run and its planned outputs together.")}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Beer",
    group: "Global",
    name: "Lot trace",
    job: "Trace a lot globally from material to customer",
    reads: "trace_lot [design]",
    writes: "none",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.back("Search", "L-240831-HZ")}
      {E.row("Hazy IPA · 16 oz case", "RUN-0028 · packaged 8/31", "118 cases")}
      {E.tape([["−40 · ORD-0225 · Ridgeline", "8/27"], ["−24 · ORD-0229 · Teresa’s", "8/29"], ["−6 · taproom transfer", "8/30"], ["−2 · sample", "8/30"]])}
      {E.nav("Materials in", "2-row L-0821 · Citra L-0790")}
      {E.ttl("Recall contacts")}
      {E.row("Ridgeline Tap Room", "Dana · 610-555-0140")}
      {E.row("Teresa’s", "Teresa · 215-555-0199")}
      {E.btn("Print trace", "g")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Purchase orders",
    job: "See draft, sent and partially received purchase orders",
    reads: "list_purchase_orders [design]",
    writes: "none [creation and receiving happen on their own surfaces]",
    states: [["draft", "Send is the next action"], ["partial", "Receive stays available for the remainder"], ["empty", "no open purchase orders: New PO is the only action"]],
    spec: "The Work list with the POs chip active. Each row names the next action; New PO opens the existing vendor purchase draft, and Receive PO returns here.",
    body: (<>
      {E.hd("Work", "warehouse default")}
      {E.btn("New PO")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 4)}
      {E.row("PO-0142 · Country Malt", "sent · due Thu", E.act("Receive"))}
      {E.row("PO-0141 · YCH", "partially received · 1 Citra box due", E.act("Receive"), "w")}
      {E.row("PO-0143 · CanSource", "draft · 4 pallets", E.act("Send"))}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receive PO",
    job: "Count what arrived; trigger derives receipt status",
    reads: "get_purchase_order [design]",
    writes: "send_purchase_order [design; single row draft → sent] · receive_purchase_order [design; one RPC: receipt + lines (counted, over or short) + lots with best_by + material movements]",
    states: [["loading", "PO-line skeleton"], ["stale", "receipt changed · recheck", 1], ["offline", "keep counts; commit waits"], ["permission", "warehouse or admin", 1], ["success", "partially received"]],
    spec: "Send PO (green) shows while the PO is draft; receiving needs a sent PO. Only counted quantity posts; over and short are both visible and both allowed, and the keypad never clamps an over-count as the only guard. PO status is trigger-derived; never write a loaded/status flag.",
    body: (<>
      {E.back("Purchase orders", "PO-0142 · Country Malt")}
      {E.fld("Status", "sent Mon · expected Thu")}
      {E.row("2-row · 55 lb bags", "expected 40", E.stq(42), "w")}
      {E.row("Citra · 44 lb boxes", "expected 4", E.stq(3), "w")}
      {E.row("Rice hulls · 50 lb", "expected 6", E.stq(6), "ok")}
      {E.fld("Citra lot", "2026-CIT-77")}
      {E.fld("Best by", "2027-08-31")}
      {E.tape([["+2,310 lb 2-row · receipt", "over 2 bags"], ["+132 lb Citra · receipt", "lot 2026-CIT-77 · short 1"]])}
      {E.info("2-row is over by 2 bags and Citra short 1; the PO becomes partially received.")}
      {E.sp()}
      {E.btn("Receive purchase order", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receipt",
    job: "What posted after a receive, including over and short",
    reads: "get_purchase_order [design]",
    writes: "none",
    states: [["partial", "the PO is partially received"], ["complete", "every line met expected"]],
    spec: "Post-commit of Receive PO. The tape is the receipt; status is derived.",
    body: (<>
      {E.back("Work", "PO-0142 · received")}
      {E.fld("Status", "partially received")}
      {E.tape([["+2,310 lb 2-row · receipt", "over 2 bags"], ["+132 lb Citra · receipt", "lot 2026-CIT-77 · short 1"]])}
      {E.info("2-row is over by 2 bags and Citra short 1.")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Beer",
    name: "Materials on hand",
    job: "See material quantities, lots and best-by dates and start a count",
    reads: "get_material_on_hand [design]",
    writes: "none [counts happen in the Cycle count sheet]",
    states: [["expiring", "the earliest best-by date needs attention"], ["empty", "no materials yet: Add material is the only action"]],
    spec: "The Beer landing's Materials row opens this list. Count opens Cycle count for that material; Add material opens the existing material and vendor flow.",
    body: (<>
      {E.back("Beer", "Materials on hand")}
      {E.btn("Add material")}
      {E.row("Cans · 16 oz", "3,100 each · 2 lots · best by none", E.act("Count"))}
      {E.row("Citra 2026 · YCH", "262 lb · 1 lot · best by 8/31/27", E.act("Count"))}
      {E.row("2-row 2026 · Country Malt", "8,800 lb · 3 lots · best by 3/15/27", E.act("Count"))}
      {E.row("Yeast · WLP066", "2 brinks · 2 lots · best by 9/8/26", E.act("Count"), "w")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    group: "Global",
    surface: "sheet",
    name: "Cycle count",
    job: "Post only variance as an append-only movement",
    reads: "get_material_on_hand [design]",
    writes: "record_material_count [design; one RPC: count + lines + adjustment movements]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.pick("Material", "Cans · 16 oz")}
      {E.num("3,050", "system 3,100 · variance −50 each")}
      {E.chips(["each", "case"])}
      {E.pin(<>
        {E.pad()}
        {E.btn("Record count", "irr")}
      </>)}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Vendors",
    job: "List suppliers and open one supplier's terms",
    reads: "list_vendors_and_contracts [design]",
    writes: "none [creation and editing happen on Vendor]",
    states: [["active", "available for purchase orders"], ["contract", "committed quantity summarized"], ["empty", "Add vendor is the only action"]],
    spec: "Materials, vendors and contracts are separate lists so each row has one predictable destination.",
    body: (<>
      {E.back("More", "Vendors")}
      {E.btn("Add vendor")}
      {E.row("YCH", "hops · 10-day lead · 1 active contract", E.act("Edit"))}
      {E.row("Country Malt", "grain · 14-day lead · 1 active contract", E.act("Edit"))}
      {E.row("CanSource", "packaging · 21-day lead", E.act("Edit"))}
      {E.nav("Materials", "12 materials")}
      {E.nav("Contracts", "2 active commitments")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Materials",
    job: "List material definitions separately from on-hand lots",
    reads: "list_materials",
    writes: "none [creation and editing happen on Material]",
    states: [["active", "available to recipes and purchase orders"], ["inactive", "history remains", 1], ["empty", "Add material is the only action"]],
    spec: "This list owns material facts; Materials on hand remains the inventory view.",
    body: (<>
      {E.back("Vendors", "Materials")}
      {E.btn("Add material")}
      {E.row("Citra", "hop · lb · 262 lb on hand", E.act("Edit"))}
      {E.row("2-row", "grain · lb · 8,800 lb on hand", E.act("Edit"))}
      {E.row("Cans · 16 oz", "packaging · each · 3,100 on hand", E.act("Edit"))}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Material",
    job: "Create or edit one material definition",
    reads: "list_materials",
    writes: "create_material · update_material",
    states: [["new", "name, kind and unit required"], ["in use", "unit change refused", 1]],
    spec: "Inventory quantities and lots are not edited on the definition.",
    body: (<>
      {E.inp("Material name · Citra")}
      {E.pick("Kind", "Hop")}
      {E.pick("Unit", "lb")}
      {E.row("Active", "available to recipes and purchase orders", E.act("On"), "ok")}
      {E.btn("Save material")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Vendor",
    job: "Create or edit one supplier and its purchase terms",
    reads: "list_vendors_and_contracts [design]",
    writes: "upsert_vendor [design]",
    states: [["new", "name required"], ["active", "available for purchase orders"]],
    spec: "Contracts remain separate records because a vendor may supply many materials.",
    body: (<>
      {E.inp("Vendor name · YCH")}
      {E.inp("Email · orders@ych.example")}
      {E.inp("Lead time · 10 days")}
      {E.pick("Terms", "Net 30")}
      {E.btn("Save vendor")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Contracts",
    job: "List material commitments and remaining quantities",
    reads: "list_vendors_and_contracts [design]",
    writes: "none [creation and editing happen on Contract]",
    states: [["active", "remaining quantity shown"], ["fulfilled", "history remains"], ["empty", "Add contract is the only action"]],
    spec: "Each commitment is one vendor and one material.",
    body: (<>
      {E.back("Vendors", "Contracts")}
      {E.btn("Add contract")}
      {E.row("YCH · Citra 2026", "400 lb committed · 138 lb remaining", E.act("Edit"))}
      {E.row("Country Malt · 2-row 2026", "20,000 lb committed · 11,200 lb remaining", E.act("Edit"))}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    surface: "sheet",
    name: "Contract",
    job: "Create or edit one material purchasing commitment",
    reads: "list_materials · list_vendors_and_contracts [design]",
    writes: "upsert_material_contract [design]",
    states: [["new", "vendor, material and quantity required"], ["received", "received quantity is read-only"]],
    spec: "Receipts update progress; this sheet only owns the commitment.",
    body: (<>
      {E.pick("Vendor", "YCH")}
      {E.pick("Material", "Citra 2026")}
      {E.inp("Committed quantity · 400 lb")}
      {E.fld("Received", "262 lb · read-only")}
      {E.pick("Delivery window", "September 2026")}
      {E.btn("Save contract")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipes",
    job: "Find recipe versions and create the next recipe",
    reads: "list_recipes [design]",
    writes: "none [creation and versioning happen on Recipe]",
    states: [["draft version", "Finish is the next action"], ["empty", "no recipes yet: Create recipe is the only action"]],
    spec: "The More landing's Recipes row opens this list. Each row opens Recipe at its current version and names the next action; Create recipe opens the same surface with only name and style.",
    body: (<>
      {E.back("More", "Recipes")}
      {E.btn("Create recipe")}
      {E.row("Hazy IPA v4", "IPA · 15 bbl · updated Aug 28", E.act("Review"))}
      {E.row("Pils v3", "German pils · 15 bbl · updated Aug 21", E.act("Review"))}
      {E.row("Stout v2", "Stout · draft version", E.act("Finish"), "w")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipe",
    job: "Author immutable versions from assumptions; actuals keep predictions honest",
    reads: "list_recipes · get_recipe [design] · get_recipe_outcomes [design; per-batch actual OG/FG/ABV + realized efficiency/attenuation, derived from fermentation readings, never stored]",
    writes: "create_recipe [design; mutable parent row] · create_recipe_version [design; one RPC: immutable version + ingredients; SCHEMA-GATE: assumption columns on recipe_versions + per-ingredient extract snapshot + extract potential on materials; typed target_og/fg/abv columns drop]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Predictions come from one shared registry-layer formula over the version’s snapshotted inputs (assumptions + per-ingredient extract); the editor’s live preview and server reads call the same function; values are never stored, so there is no SQL copy. Versioning is disabled behind its schema gate. A new parent takes name and style only; versions append, and history is never edited. Costing lives on desk.",
    body: (<>
      {E.back("Recipes", "Hazy IPA v4")}
      {E.row("Recipe parent · Hazy IPA · IPA", "name and style only", E.act("Create"))}
      {E.chips(["per bbl", "15 bbl", "30 bbl"], 1)}
      {E.row("2-row", "mash · 44 lb / bbl", "660 lb")}
      {E.row("Citra", "boil · 10 min · 0.4 lb / bbl", "6 lb")}
      {E.row("Citra", "dry hop · day 4 · 1.2 lb / bbl", "18 lb")}
      {E.row("+ add ingredient", "material · stage · timing", "")}
      {E.fld("Mash temp", "152 °F")}
      {E.fld("Brewhouse efficiency", "72 %")}
      {E.fld("Yeast attenuation", "78 % · WLP066")}
      {E.info("Predicted: OG 15.2 °P · FG 3.3 °P · ABV 6.5%")}
      {E.tape([["B-0413 · OG 14.8 · FG 3.5 · ABV 6.0%", "eff 68% · att 76%"], ["B-0398 · OG 15.1 · FG 3.4 · ABV 6.3%", "eff 71% · att 77%"]])}
      {E.note("Actuals run −0.4 °P OG vs predicted (eff 68–71% vs 72% assumed). Lower the assumption on v5?")}
      {E.gated("Create recipe version")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance months",
    job: "Choose a reporting month and see whether its snapshot was filed",
    reads: "list_compliance_reports [design]",
    writes: "none",
    states: [["current", "ready for review"], ["filed", "immutable snapshot saved"], ["blocked", "report does not balance", 1]],
    spec: "This is the shared destination for the registry back link and the report month picker.",
    body: (<>
      {E.back("More", "Compliance")}
      {E.nav("September 2026", "current · ready to review", "w")}
      {E.nav("August 2026", "filed 9/02/2026 · $1,508 excise", "ok")}
      {E.nav("July 2026", "filed 8/04/2026 · $1,442 excise", "ok")}
      {E.nav("Compliance registry", "brands, states and licenses")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Monthly compliance",
    job: "Generate from ledgers, review, then record the external filing",
    reads: "generate_compliance_report · get_loss_review [design; SCHEMA-GATE for typed completion-loss identity]",
    writes: "file_compliance_report [design; immutable snapshot] · reattribute_loss [SCHEMA-GATE; requires typed origin/classification + atomic compensation]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Reattribution waits for schema that identifies completion rows and cellar removal class; correction must be atomic append-only compensation, never free-text note matching. The identity checks are v1 lessons drawn in user copy: balance per class, cellar as in-process, 0.00 never blank, no transmission.",
    body: (<>
      {E.back("Compliance months", "August 2026")}
      {E.pick("Month", "August 2026")}
      {E.row("1 · Review auto-reconciled losses", "review isn’t available yet", "3", "w")}
      {E.row("2 · Review generated figures", "", E.act("Current"))}
      {E.tbl(["class", "begin", "+", "−", "end"], [["cellar · in-process", "120.40", "62.00", "58.10", "124.30"], ["kegs", "41.00", "30.50", "33.20", "38.30"], ["cans", "12.60", "18.00", "14.90", "15.70"], ["bottles", "0.00", "0.00", "0.00", "0.00"]])}
      {E.info("Every class balances: begin + in − out = end. Cellar leaves by packaging, not as a removal. Zeros print 0.00.")}
      {E.row("PA / OH excise", "generated", "$1,508")}
      {E.row("3 · Confirm filed outside MGR", "", E.act("Confirm"))}
      {E.info("MGR saves the immutable snapshot; it does not transmit the filing. Save stays off until the report balances.")}
      {E.btn("Save filed snapshot", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance registry",
    job: "Maintain brand and state permissions used by order warnings",
    reads: "get_compliance_registry [design]",
    writes: "upsert_brand_approval · upsert_state_registration · upsert_brewery_state_license [design]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    spec: "Unregistered destination/brand combinations warn during order confirm and link here.",
    body: (<>
      {E.back("Compliance months", "Registry")}
      {E.chips(["brands", "states", "licenses"])}
      {E.row("Hazy IPA", "COLA approved · formula n/a", E.act("Edit"))}
      {E.row("Stout", "COLA pending", E.act("Edit"), "w")}
      {E.row("Ohio", "supplier registered · expires 12/31", E.act("Edit"))}
      {E.row("Pennsylvania brewery license", "expires 6/30/2027", E.act("Edit"))}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "Brand approval",
    job: "Record one brand’s federal approval status",
    reads: "get_compliance_registry [design]",
    writes: "upsert_brand_approval [design]",
    states: [["approved", "orders may proceed"], ["pending", "order confirmation warns", 1]],
    body: (<>
      {E.pick("Brand", "Stout")}
      {E.inp("COLA number · pending")}
      {E.inp("Formula number · not required")}
      {E.btn("Save approval")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "State registration",
    job: "Record permission to sell one brand in one state",
    reads: "get_compliance_registry [design]",
    writes: "upsert_state_registration [design]",
    states: [["registered", "brand may ship to the state"], ["missing", "order confirmation warns", 1]],
    body: (<>
      {E.pick("Brand", "Hazy IPA")}
      {E.pick("State", "Ohio")}
      {E.inp("Registration number · OH-88214")}
      {E.inp("Expires · 12/31/2026")}
      {E.btn("Save registration")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    surface: "sheet",
    name: "License",
    job: "Record one brewery state license",
    reads: "get_compliance_registry [design]",
    writes: "upsert_brewery_state_license [design]",
    states: [["current", "orders may proceed"], ["expired", "order confirmation warns", 1]],
    body: (<>
      {E.pick("State", "Pennsylvania")}
      {E.inp("License number · G-21884")}
      {E.inp("Expires · 6/30/2027")}
      {E.btn("Save license")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    name: "POS mapping",
    job: "Sync idempotently, map reversibly, then post explicit depletion",
    reads: "get_pos_setup [design]",
    writes: "connect_square · sync_square_sales [design; one security-invoker batch RPC per fetched page, deduped by unique external line ID] · set_pos_location_mapping · set_pos_item_mapping · reconcile_pos_sales [design; one RPC: selected depletion movements + sale links]",
    states: [["disconnected", "Connect Square starts external OAuth", 1], ["invalid mapping", "Reconcile disabled until brand/format and quantity per sale validate", 1], ["unmapped location", "its sales hold · nothing reconciles from it", 1], ["location added in Square", "found on the next sync · appears unmapped", 1], ["mapped late", "held sales reconcile at their own dates", 1], ["closed in Square", "mapping and history kept · nothing new arrives", 1]],
    spec: "Locations are never typed: ListLocations returns them at connect and they land in MGR’s list of POS locations, so the left of each row is Square’s truth and only the right is a choice. Both choices open the shared entity picker rather than a mapping page of their own: three rows do not earn a screen, and lifting them out would hide the gate from the reconcile that is blocked by it. MGR holds one Square location to one MGR location: a second claim on the same MGR location is refused, or two registers would deplete one shelf without either knowing. ListLocations runs on every sync, not only at connect: a location opened next year has to surface on its own, or its sales disappear with nothing on screen to explain it. It appears unmapped rather than defaulting to anything. Its held sales are the reason the row counts them: raw rows never delete, so mapping makes a backlog reconcilable rather than forgiving it, and each depletion posts at its own sale date. Posting a month of pours on the mapping date would balance the ledger and falsify every variance report built on it. Nothing else is asked for: once mapped, availability derives from that location’s stock and prices inherit their format defaults, so the menu fills itself. A location closed in Square keeps its mapping and its history and simply stops producing sales. External fetch/retry reuses requestId; raw sale rows never delete; no durable cursor is claimed. Reconcile posts immutable rows only after both mapping fields validate. A former SCHEMA-GATE is closed here: the sale channel is no longer a fixed four-value list pinned to Taproom but a per-brewery table of channels, so on-premise and off-premise report separately without a movement-model change. Each depletion carries a sale channel resolved as the item’s channel override, falling back to the location’s channel: never inferred, and never the old Taproom literal, so two Square locations can post under different channels. Refund lines are in the same list and the same RPC/requestId: a refund previews as a positive adjustment (inventory credit); sales-only reconcile is how v1 lost units. INVERTED (was drawn the other way round): the physical count is the source of truth and posts the depletion; POS sales post nothing and supply expected consumption. The gap between them is the product (bad pours, theft, staff drinks, comps, line cleaning), and it exists only because both halves are kept. Reconcile therefore records the expected figure and the sale links, never a movement.",
    body: (<>
      {E.back("Settings", "Square")}
      {E.btn("Sync Square sales", "g")}
      {E.info("Locations come from Square. Choose what each one feeds and which channel its sales post under.")}
      {E.nav("Square Taproom", "MGR Taproom · channel Taproom", "ok")}
      {E.nav("Square Warehouse", "MGR Warehouse · channel DTC", "ok")}
      {E.nav("Square Events", "new · 42 held sales since Aug 12", "w")}
      {E.btn("Save location mapping", "g")}
      {E.row("“Hazy 16 oz draft”", "exact SKU/package", E.act("Hazy IPA · ½ bbl keg"))}
      {E.fld("Qty per sale", "1/124 keg per 16 oz")}
      {E.fld("Channel override", "none · inherits Taproom")}
      {E.btn("Save item mapping", "g")}
      {E.row("7 sales · Hazy 16 oz", "depletion", "−0.0282 bbl")}
      {E.row("1 refund · Hazy 16 oz", "inventory credit · adjustment", "+0.0040 bbl", "w")}
      {E.note("The weekly count posts the depletion. These sales are the expected number the count is measured against.")}
      {E.btn("Reconcile 7 sales + 1 refund", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "POS sale detail",
    job: "Trace one Square sale through mapping, expected barrels and reconciliation",
    reads: "get_pos_sale [design]",
    writes: "none [mapping changes on POS mapping]",
    states: [["reconciled", "linked to a count", 0], ["unmapped", "held until item mapping validates", 1], ["refund", "expected consumption reverses"]],
    spec: "The sale detail explains expected consumption only. The physical count remains the inventory write.",
    body: (<>
      {E.back("POS mapping", "Square sale SQ-88421")}
      {E.row("Square Taproom · 9/02 8:14 PM", "$7.00 · completed", "SQ-88421", "ok", SquareMark)}
      {E.row("Hazy 16 oz draft × 1", "mapped to Hazy IPA · ½ bbl keg", E.act("Open mapping"))}
      {E.fld("Expected consumption", "1/124 keg · 0.0040 bbl")}
      {E.fld("Sales channel", "Taproom · inherited from location")}
      {E.row("Weekly count · 9/03", "included in expected total · count posted depletion", E.act("Open count"), "ok")}
      {E.info("Square supplied the expected amount. No inventory movement was posted by this sale.")}
    </>),
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg fleet",
    job: "Manage pools and record events without confusing beer returns",
    reads: "get_keg_fleet [design]",
    writes: "create_keg_pool · update_keg_pool [design; mutable single rows] · record_keg_event [design; intents acquired / returned / lost / found / retired; returned = one RPC: keg event + standalone credit memo with keg_deposit_refund line]",
    states: [["acquire", "qty into pool · no customer"], ["return empty", "customer required · deposit refund previews"], ["lost / found", "customer balance moves · no money"], ["retire", "out of service · no customer"]],
    spec: "Return empty posts the deposit refund in the same RPC; there is no deposit-only screen. Beer coming back with the keg is Return shipment (beer + deposit). No dirty/clean CIP status.",
    body: (<>
      {E.back("Beer", "Keg fleet")}
      {E.fld("Selected pool", "Owned ½ bbl · 203 kegs · $30 deposit")}
      {E.btns([["Add keg pool", "g"], ["Save keg pool", "g"]])}
      {E.row("Owned ½ bbl", "142 out · 61 in", "203")}
      {E.nav("Customer keg balance", "Ridgeline · 38 out · $1,140")}
      {E.nav("Keg report", "9 unreturned over 90 days")}
      {E.nav("Keg event history", "acquired, returned, lost, found, retired")}
      {E.chips(["acquire", "return empty", "lost / found", "retire"], 1)}
      {E.fld("Customer · qty", "Ridgeline · 4 × ½ bbl")}
      {E.info("Preview: +4 returned · Ridgeline 38 → 34 out · credit memo −$120.00 deposit refund")}
      {E.note("Empty kegs only; beer return/credit is Return shipment.")}
      {E.btn("Record keg return · refund $120", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Customer keg balance",
    job: "See every keg pool one customer has out and the deposit exposure",
    reads: "get_customer_keg_balance [design]",
    writes: "none",
    states: [["current", "all pools and deposits shown"], ["overdue", "oldest unreturned kegs flagged", 1], ["none", "no kegs currently out"]],
    spec: "The same customer-owned detail is reachable from Customers and Keg fleet.",
    body: (<>
      {E.back("Keg fleet", "Ridgeline Tap Room")}
      {E.num("38 kegs", "$1,140 deposits held")}
      {E.row("Owned ½ bbl", "34 out · $30 deposit each", "$1,020")}
      {E.row("Owned ⅙ bbl", "4 out · $30 deposit each", "$120")}
      {E.row("Over 90 days", "9 kegs · oldest shipped 5/12/2026", E.act("Review history"), "w")}
      {E.info("Beer returns use Return shipment. Empty keg returns are recorded from Keg fleet.")}
    </>),
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg event history",
    job: "Audit acquired, returned, lost, found and retired keg events",
    reads: "list_keg_events [design]",
    writes: "none",
    states: [["all", "newest first"], ["filtered", "customer and pool filters combine"], ["empty", "no matching events"]],
    spec: "This is the immutable keg ledger, not an editor.",
    body: (<>
      {E.back("Keg fleet", "Keg event history")}
      {E.pick("Customer", "All customers")}
      {E.pick("Keg pool", "All pools")}
      {E.row("Returned · Ridgeline", "9/03 · 4 × Owned ½ bbl", "Dana", "ok")}
      {E.row("Lost · Al’s Bar", "9/01 · 1 × Owned ½ bbl", "Ali", "w")}
      {E.row("Found · Al’s Bar", "8/30 · 1 × Owned ½ bbl", "Dana")}
      {E.row("Acquired", "8/28 · 12 × Owned ⅙ bbl", "Avery")}
      {E.row("Retired", "8/22 · 2 × Owned ½ bbl", "Avery")}
    </>),
  },
  {
    step: 7,
    slice: 9,
    tab: "Beer",
    name: "Keg report",
    job: "Review unreturned aging and utilization across the keg fleet",
    reads: "get_keg_report [design]",
    writes: "none",
    states: [["aging", "customer balances grouped by age"], ["utilization", "out divided by active fleet"], ["empty", "no owned keg pools"]],
    spec: "Aging identifies who needs follow-up; utilization shows whether the fleet is working or sitting.",
    body: (<>
      {E.back("Keg fleet", "Keg report")}
      {E.num("70%", "142 of 203 owned half bbl kegs out")}
      {E.tbl(["Age", "Kegs", "Deposits"], [["0–30 days", "96", "$2,880"], ["31–60 days", "25", "$750"], ["61–90 days", "12", "$360"], ["Over 90 days", "9", "$270"]])}
      {E.row("Ridgeline Tap Room", "9 over 90 days · oldest 5/12", E.act("Open balance"), "w")}
      {E.row("Owned ⅙ bbl", "18 of 36 out", "50% utilized")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    name: "Tap board",
    job: "What is on, since when, and roughly how much is left",
    reads: "list_open_taps [design; Realtime on this page only, 30s poll is an adequate fallback]",
    writes: "tap_keg · swap_keg [design; closes A and opens B in one RPC] · kick_keg [design; compare-and-swap on the open interval id; Kick keg sheet]",
    states: [["swap", "one act, one record · never kick-then-tap"], ["already swapped", "second attempt fails · Helles was already swapped out at 7:42pm", 1], ["not in taproom stock", "put on by a person · never discovered from Square", 1], ["guest or event keg", "yield from nominal size · excluded from variance", 1], ["two kegs, one brand", "taps 2 and 9 · sales split proportionally, yield labelled split", 1], ["no number", "sorts last · a number is never required"], ["duplicate number", "shown as entered · nothing downstream reads it"], ["kicked", "interval closed with a reason · the tap goes empty"], ["packaged short", "enters stock open · filled volume is measured, not guessed", 1], ["open, off tap", "still open stock · counted by volume, not as a whole keg", 1]],
    redrawn: true,
    spec: <>A tile opens Swap keg for that tap; Kick on a row opens Kick keg. No second filled button on this board. The decided schema (16.13) chose differently from the first drawing: the primitive is the <b>swap</b>, not tap-then-blow. A bartender changing a keg performs one act, and a kick-then-tap model asks for two records; the gap between them is where data goes missing, worst exactly when it matters, on a follow keg of the same beer where nothing looks wrong afterwards. The swap command closes A and opens B in one RPC, the same discipline as the keg-return RPC, so an interval can never be left open by a half-finished swap. That is also why lines were the wrong model: the ambiguity was never about where a keg is plugged in. Numbers here are the brewery’s own, optional and sparse (1, 3, 5 with nothing at 2 or 4). They sort this board and nothing else reads them, so MGR neither generates nor enforces them and two kegs numbered alike is a thing to look at, not a save error. Unnumbered kegs sort last. A keg that is not ours reaches this board one way only: somebody tapped it here. Nothing arrives from Square: an item the taproom created there is <i>ignored</i> under 16.14, never queued and never mapped, so the guest cider in the register and the guest cider on this line are two unrelated facts that happen to share a name. It is recorded because the board is what the website reads, and a board that silently omits a pouring tap lies to customers, and because the keg still earns a yield from its nominal size. Nothing here touches the ledger: the count posts depletion (16.15), which is what makes two writers safe and why a keg tapped outside taproom stock needs no special rule: it is flagged as not in inventory, still earns a yield from its nominal size, and is excluded from variance. A keg packaged short enters stock <b>open</b> rather than as sealed inventory, which is the decision that makes it obvious it should be used next and, more quietly, keeps a weekly count honest: counted as one keg it would overstate the shelf, counted by its volume it does not. That also means the opening fill for such a keg is <i>known</i>, measured at the packaging run and already in the ledger as that run’s output, rather than the eyeball the spec assumes; a yield derived from it is measured, not estimated. Remaining percent is estimated from POS sales against nominal volume, and it is the reason this screen is worth opening: a board that only takes data from people gets ignored. Two kegs of one brand open at once splits sales proportionally and any per-keg yield is labelled <i>split</i>, never presented as measured. The duplicate-swap risk is uncertainty, not simultaneity: the command carries the open interval id and requires that the interval is still open, so the second attempt fails with copy a human can act on rather than opening a phantom interval; the recent list below is the correction path, not a guard.</>,
    body: (<>
      {E.back("Beer", "Tap board")}
      {E.ttl("On tap")}
      {E.chips(["Taproom", "Warehouse"], 0)}
      {E.tiles([["1", "Pils · ½ bbl", "on Mon", 0, 71, 1], ["2", "Hazy IPA · ½ bbl", "on Mon", 0, 62, 1], ["3", "Stout · ⅙ bbl", "on Tue · filled 60%", 0, 34, 1], ["4", "Amber · ½ bbl", "on Sat", 0, 88, 1], ["5", "Helles · ½ bbl", "on Wed · nearly out", 1, 9, 1], ["6", "Saison · ½ bbl", "on Thu", 0, 54, 1], ["8", "Porter · ⅙ bbl", "on Fri", 0, 46, 1], ["9", "Hazy IPA · ½ bbl", "on Thu · second keg", 1, 93, 1], ["10", "Kolsch · ½ bbl", "on Tue", 0, 27, 1], ["11", "Barrel Dark · ⅙ bbl", "on Sun", 0, 80, 1], ["unnumbered", "Wild Ale · ⅙ bbl", "on Thu · sorts last", 0, 66, 1]])}
      {E.row("7 · Guest cider · keg", "tapped here by Dana · not our stock, no depletion", E.act("Kick"), "w")}
      {E.ttl("Open, not on a tap")}
      {E.row("Amber · ½ bbl", "packaged short · filled 60% · 0.30 bbl", E.act("Tap"), "w")}
      {E.row("Stout · ⅙ bbl", "pulled off tap 9 Sun · ~40% left", E.act("Tap"), "w")}
      {E.info("A keg that was never filled to nominal enters stock open, not sealed. It counts as beer, not as a keg, and it is meant to be used next.")}
      {E.info("Tap 7 is empty. Unnumbered kegs sort last.")}
      {E.row("Recent · Kolsch tapped", "Dana · Tue 4:10pm")}
      {E.row("Recent · Saison swapped in", "Ali · Thu 11:20am")}
      {E.note("Remaining is estimated from POS sales against nominal volume. Nothing on this board posts to the ledger; the weekly count does that.")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    surface: "sheet",
    name: "Kick keg",
    job: "Close one tap without opening a replacement keg",
    reads: "list_open_taps [design]",
    writes: "kick_keg [design; compare-and-swap on open interval id]",
    states: [["empty", "tap becomes empty"], ["beer remaining", "open keg stays in taproom stock"], ["already closed", "reload before acting", 1]],
    spec: "Kick is separate from Swap because it leaves the tap empty and needs a closing reason.",
    body: (<>
      {E.ttl("Kick tap 5")}
      {E.fld("Coming off", "Helles · ½ bbl · on since Wed")}
      {E.pick("Reason", "Kicked empty")}
      {E.ttl("Remaining")}
      {E.chips(["empty", "about ¼ left", "about ½ left"], 0)}
      {E.info("Beer left in the keg remains open taproom stock and can be tapped again.")}
      {E.btn("Kick keg", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    surface: "sheet",
    name: "Swap keg",
    job: "Close one keg and open the next in a single record",
    reads: "list_open_taps · get_taproom_sellable [design]",
    writes: "swap_keg [design; closes A and opens B in one RPC, carries the open interval id and requires closed_at null]",
    states: [["same brand", "the follow keg is the default · one tap, not two records"], ["guest keg", "name and nominal size are typed · nothing comes from Square", 1], ["already swapped", "Helles was swapped out at 7:42pm by Ali · nothing opens", 1], ["no number", "left blank · the keg sorts last on the board"], ["close fill", "three chips · never a typed number", 1], ["kicked instead", "closes with a reason · the tap goes empty"]],
    spec: <>The surface every other tap decision assumed and none of them showed. One sheet, because the swap is one act: what comes off and what goes on are decided together and written by one RPC, so an interval can never be left open by a half-finished swap. Going on defaults to the same brand, which is the common case (a follow keg of the flagship) and is exactly the case a kick-then-tap model loses, because afterwards nothing looks wrong. Coming off asks for a rough remaining, never a number: yield is poured ÷ (nominal × (opening fill − closing fill)), and the honest input is three chips rather than a text field implying precision nobody has. Empty is the default because it is nearly always true. <b>Not our stock</b> is the toggle that answers where a guest keg comes from: nothing is discovered from Square, where such an item is <i>ignored</i> under 16.14 and never maps. A person puts it on and types it, which is why name and nominal size become inputs here: there is no brand to read them from, and yield needs the size. SCHEMA-GATE: 16.13 says an interval flagged as not in inventory earns a yield from its nominal size but never says what identifies the beer when no brand exists behind it; the interval needs its own label and size columns. The tap number is typed and optional, here as everywhere: MGR has no concept of a physical line, so this field is the only place a number can enter the system. The conflict row is the compare-and-swap guard made visible: the command carries the open interval id and requires that the interval is still open, so the realistic failure (the website posted a swap, the bartender did not see it land and swaps again a minute later) fails with copy naming the beer, who and when instead of opening a phantom interval.</>,
    body: (<>
      {E.row("Already swapped", "Helles was swapped out at 7:42pm by Ali", E.act("Reload"), "w")}
      {E.ttl("Coming off")}
      {E.fld("Tap 5", "Helles · ½ bbl · on since Wed")}
      {E.chips(["empty", "about ¼ left", "about ½ left"], 0)}
      {E.ttl("Going on")}
      {E.nav("Helles · ½ bbl", "taproom stock · 4 available · same brand")}
      {E.row("Not our stock", "guest or event keg · no depletion, no variance", E.act("Off"))}
      {E.inp("Name · Guest cider")}
      {E.chips(["½ bbl", "⅙ bbl", "50 L"], 0)}
      {E.fld("Tap number", "5 · optional")}
      {E.info("Remaining is a rough call, not a measurement; it only feeds the yield report and never the ledger.")}
      {E.btn("Swap · one record", "irr")}
      {E.note("The swap is one record. A half-finished swap is not a state this can reach.")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Routes",
    job: "See planned and active delivery routes and build the next one",
    reads: "list_routes [design]",
    writes: "none [route planning happens on Route]",
    states: [["unassigned", "shipped orders waiting for a route are called out"], ["empty", "no routes yet: New route is the only action"]],
    spec: "The Work list with the routes chip active. Every row names its next action; New route opens Route in builder mode, and Route returns here.",
    body: (<>
      {E.hd("Work", "driver default")}
      {E.btn("New route")}
      {E.chips(["all", "orders", "batches", "runs", "POs", "routes"], 5)}
      {E.row("Route A · Thu", "3 stops · Maria · departed 8:10", E.act("Resume"))}
      {E.row("Route B · Fri", "2 stops · driver not assigned", E.act("Assign"), "w")}
      {E.row("ORD-0236 · Dock", "shipped · no route", E.act("Add to route"), "w")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Route",
    job: "Build route, inspect derived load and finish route timestamps",
    reads: "get_route_load · get_route_builder [design; require persisted shipment invoice timing]",
    writes: "save_route [design; one RPC: route + stop assignments] · depart_route · return_route [design]",
    states: [["post-route", "All stops complete · no return time yet"]],
    spec: "Planned state: Depart is the one primary; Save route plan is outline. Return lives on Return route once the route has departed. Load derives only from shipments with a persisted invoice mode; the checklist is presentation only, with no loaded status or mark-loaded command. Unassigned shipments become stops with driver, vehicle and stop order in the same route-save RPC. A refused delivery has no screen: leave the stop open and assign it to a later route. Resume opens the next incomplete stop for the assigned driver.",
    body: (<>
      {E.back("Routes", "Route A · Thu")}
      {E.fld("Driver · vehicle", "Maria · Box truck 2")}
      {E.row("Stop 1 · Ridgeline", "4 Hazy halves · 6 Pils cases", "next")}
      {E.row("Stop 2 · Al’s Bar", "2 Stout sixths", "after")}
      {E.row("Stop 3 · Teresa’s", "8 Hazy halves · 12 Pils cases", "after", "w")}
      {E.row("Unassigned · ORD-0236 · Dock", "3 Hazy halves · shipped, no route", E.act("Add stop"), "w")}
      {E.btns([["Save route plan", "g"], ["Depart route", "p"]])}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Return route",
    job: "Stamp the return once every stop is done",
    reads: "get_route_load [design]",
    writes: "return_route [design]",
    states: [["planned", "Depart lives on Route"], ["departed", "Return is the one verb"], ["complete", "already returned"]],
    spec: "The departed state of a route. Planned routes Depart on Route; this screen is only Return.",
    body: (<>
      {E.back("Work", "Route A · Thu")}
      {E.fld("Driver · vehicle", "Maria · Box truck 2")}
      {E.row("Stop 1 · Ridgeline", "delivered 8:42", "done", "ok")}
      {E.row("Stop 2 · Al’s Bar", "delivered 9:15", "done", "ok")}
      {E.row("Stop 3 · Teresa’s", "delivered 10:03", "done", "ok")}
      {E.sp()}
      {E.btn("Return route")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Driver route",
    job: "The route as the driver sees it: every stop, the load, Return",
    reads: "get_route_load [design]",
    writes: "return_route [design]",
    states: [["departed", "Return is the one verb"], ["next stop", "Resume opens Confirm delivery"]],
    spec: "Off Driver Today’s Route A row. Planner Route is for building; this is for running. Load is derived from the shipments on the stops.",
    body: (<>
      {E.back("Today", "Route A · Thu")}
      {E.fld("Load", "14 Hazy halves · 18 Pils cases · 2 Stout sixths")}
      {E.row("Stop 1 · Ridgeline Tap Room", "4 Hazy halves · 6 Pils cases", E.act("Resume"), "w")}
      {E.row("Stop 2 · Al’s Bar", "2 Stout sixths", "after")}
      {E.row("Stop 3 · Teresa’s", "8 Hazy halves · 12 Pils cases", "after")}
      {E.sp()}
      {E.btn("Return route")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Confirm delivery",
    job: "Name receiving contact, then commit delivery and invoice",
    reads: "get_delivery_stop [design; require persisted on-delivery invoice timing]",
    writes: "confirm_delivery [design; one RPC: delivered_at + signed_by + invoice only when persisted mode is on-delivery; never ships]",
    states: [["offline", "keep stop open; commit waits", 1], ["response lost", "same requestId returns result"], ["permission", "warehouse membership and being the route’s assigned driver, or admin", 1], ["success", "INV number after commit"]],
    spec: "2 taps: receiving-contact chip from the ship-to → Delivered. Back goes to Driver route. The receiving name is stored as text; the UI never implies a signature image is retained.",
    body: (<>
      {E.back("Driver route", "Route A · Stop 1 of 3")}
      {E.ttl("Ridgeline Tap Room")}
      {E.pick("Invoice timing", "On delivery · saved")}
      {E.row("Hazy IPA · ½ bbl keg", "", "4")}
      {E.row("Pils · 16 oz case", "", "6")}
      {E.chips(["Dana", "Chris"], -1)}
      {E.sp()}
      {E.btn("Delivered", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 8,
    group: "Desk",
    name: "Planning",
    job: "See demand gaps and draft a PO without priority state",
    reads: "get_planning_shortfalls [design]",
    writes: "draft_purchase_order_from_requirements [design; one RPC: draft PO + lines]",
    states: [["empty", "Nothing here yet"], ["offline", "cached · retry when you are back", 1], ["permission", "you cannot open this", 1], ["already done", "this write already landed"], ["error", "Did not load · Retry", 1]],
    body: (<>
      {E.back("More", "Planning")}
      {E.tbl(["week", "demand", "supply", "gap"], [["9/7", "48 bbl", "40 bbl", <><span className="text-warning-foreground">−8</span></>], ["9/14", "52 bbl", "60 bbl", "+8"]])}
      {E.row("Sept 12 packaging", "short 480 ends · lead 10 days", E.act("Review"), "w")}
      {E.row("Hazy ATP negative 9/9", "open named shortfall", E.act("Review"))}
      {E.btn("Draft purchase order")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat disconnected",
    job: "Explain the projection before an admin installs a provider",
    reads: "get_chat_integration_health [design]",
    writes: "begin_chat_installation [design; admin-only, single-use OAuth intent]",
    states: [["permission", "admin only", 1], ["OAuth cancelled", "remain disconnected · try again", 1]],
    spec: "This is production Settings UI, not a developer demo. Preview surfaces remain available while disconnected and use non-sensitive fixtures.",
    body: (<>
      {E.back("Settings", "Chat")}
      {E.ttl("Chat notifications")}
      {E.info("Bring today’s assigned, due and overdue work into chat. Slack shows the work; MGR stays the record.")}
      {E.row("Slack", "Not connected", "", "", SlackMark)}
      {E.nav("Preview surfaces", "App Home · personal DM · team digest")}
      {E.btn("Connect Slack")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat settings",
    job: "Operate one brewery/provider installation and inspect every outbound surface",
    reads: "get_chat_integration_health · get_notification_preferences · get_brewery_operating_defaults [design] · chat_preview_fixtures [presentation]",
    writes: "set_notification_destination · set_brewery_quiet_hours · set_brewery_operating_defaults · disable_chat_installation · disconnect_chat_installation [design]",
    states: [["healthy", "last callback and delivery shown"], ["retrying", "queue count + redacted reason", 1], ["disabled", "no sends; previews still work", 1]],
    spec: "Preview picker renders the same provider-neutral fixtures consumed by renderer contract tests. It never queries live customer data or sends a message. Reading cadence is MGR-owned and controls both Today and chat.",
    body: (<>
      {E.back("Settings", "Chat")}
      {E.row("Slack · Demo Brewing", "Connected · scopes healthy", E.act("Disconnect"), "ok", SlackMark)}
      {E.pick("Operations channel", "#mgr-operations · private")}
      {E.pick("Quiet hours", "9:00 PM–6:00 AM · brewery time")}
      {E.pick("Reading overdue after", "24 hours · Today + chat")}
      {E.nav("Health", "last message from Slack today · 8:42 AM")}
      {E.nav("Linked people", "3 linked")}
      {E.chips(["App Home", "Personal DM", "Team digest", "Preferences"], 0)}
      {E.row("Preview · App Home", "4 current work reasons · fixture data", E.act("Open"))}
      {E.btn("Disable", "g")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Linked people",
    job: "See which MGR users linked Slack and remove a stale link",
    reads: "list_chat_user_links [design]",
    writes: "unlink_chat_user [design]",
    states: [["linked", "three people"], ["unlinked", "personal messages stop for that person", 1]],
    spec: "A brewery admin can remove a stale identity link without disconnecting Slack for everyone.",
    body: (<>
      {E.back("Chat", "Linked people")}
      {E.row("Avery Stone", "Admin · linked 8/29/2026", E.act("Unlink"))}
      {E.row("Casey Lin", "Brewer · linked 8/30/2026", E.act("Unlink"))}
      {E.row("Morgan Reed", "Driver · linked 9/02/2026", E.act("Unlink"))}
      {E.btn("Link your Slack", "g")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    surface: "entry",
    name: "Link your Slack",
    job: "Link the signed-in Slack identity to the signed-in MGR user",
    reads: "get_chat_link_intent [design]",
    writes: "consume_chat_link_proof [design; single-use]",
    states: [["ready", "both identities named"], ["expired", "return to MGR and request a new link", 1]],
    spec: "The entry page names both identities and the brewery before consuming the single-use proof.",
    body: (<>
      {E.ttl("Link your Slack")}
      {E.info("Slack user Avery Stone will be linked to Avery Stone in Demo Brewing.")}
      {E.note("This enables personal reminders and App Home. It does not change your MGR permissions.")}
      {E.btn("Link accounts", "irr")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    surface: "sheet",
    name: "Disconnect Slack",
    job: "Confirm the external effects of disconnecting Slack",
    reads: "get_chat_integration_health [design]",
    writes: "disconnect_chat_installation [design]",
    states: [["confirmed", "installation and identity links removed"]],
    spec: "The confirmation distinguishes stopped delivery from MGR work that remains.",
    body: (<>
      {E.note("Stops: App Home, personal reminders, team digests and Slack actions.")}
      {E.info("Stays: MGR work, assignments, notification preferences and history.")}
      {E.btn("Disconnect Slack", "irr")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Reauthorization",
    job: "Fail closed while keeping recovery understandable and personal delivery isolated",
    reads: "get_chat_integration_health [design]",
    writes: "begin_chat_reauthorization · disable_chat_installation · disconnect_chat_installation [design]",
    states: [["token revoked", "all provider sends stop", 1], ["channel externalized", "team digest stops; eligible personal sends continue", 1], ["uninstalled", "links and queued actions invalidated", 1]],
    spec: "Provider errors remain redacted. Emergency disable does not depend on Slack being reachable.",
    body: (<>
      {E.back("Chat", "Health")}
      {E.note("Slack authorization expired. No messages are being sent.")}
      {E.row("Last message from Slack", "Today · 8:42 AM", E.act("Succeeded"))}
      {E.row("Last delivery", "Today · 8:43 AM", E.act("Succeeded"))}
      {E.row("Queued", "3 deliveries", E.act("Paused"), "w")}
      {E.btn("Reauthorize Slack")}
      {E.btn("Disable integration", "g")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Point of sale",
    job: "Connect one POS provider and see both directions at a glance",
    reads: "get_pos_integration_health [design; provider-neutral]",
    writes: "begin_pos_installation · disable_pos_installation · disconnect_pos_installation [design; admin-only]",
    states: [["no provider", "connect one before a menu can publish"], ["healthy", "catalog and sales both current"], ["sales lagging", "the menu still publishes", 1], ["token revoked", "publishing and sync both stop", 1], ["connector detected", "Square already posts taproom revenue to QuickBooks", 1], ["second location", "its own MGR location and its own channel", 1], ["unmapped location", "its sales cannot reconcile until it is mapped", 1]],
    spec: "Provider-neutral by construction, mirroring the chat integration that already solved this: portable contracts, one adapter per provider, and a conformance test every adapter must pass (see the chat contracts module and its adapter conformance test). Square is the only adapter today and the only value this screen can offer; nothing in the copy, the commands or the schema names it. The integration tokens table already records which provider each token belongs to (QuickBooks or Square), so the seam exists below this screen. DISCOVERED from a live Square library: a taproom may already run Square’s own QuickBooks connector, which posts taproom sales into QuickBooks as Sales receipts without MGR. That is a different revenue stream from the wholesale invoices MGR pushes, so today it does not double-count, but only by luck, and a brewery running both without knowing is the failure mode. This screen detects it and says so rather than letting the accountant find two sources of taproom revenue at month end.",
    body: (<>
      {E.back("Settings", "Point of sale")}
      {E.info("Publish what the taproom can sell, and read its sales back. One provider is connected at a time.")}
      {E.row("Square · Demo Brewing LLC", "catalog published · sales syncing", E.act("Disconnect"), "ok", SquareMark)}
      {E.row("Square → QuickBooks connector", "detected · Square posts taproom sales to QuickBooks Online itself", E.act("Review"), "w", SquareMark)}
      {E.nav("Square locations", "2 mapped · 1 needs mapping")}
      {E.fld("Last sales sync", "Today · 6:58 PM")}
      {E.nav("Menu", "one catalog · Square, the website, per-location price")}
      {E.btn("Disable", "g")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Connect Square",
    job: "Authorize one Square seller and explain the data exchange before OAuth",
    reads: "none [OAuth returns the selected seller]",
    writes: "begin_pos_installation [design]",
    states: [["cancelled", "return to Point of sale unchanged"], ["connected", "continue to Square locations"]],
    spec: "The page explains both catalog writes and sales reads before leaving MGR.",
    body: (<>
      {E.back("Settings", "Connect Square")}
      {E.info("MGR publishes catalog items and availability to Square. It reads completed sales to deplete taproom stock.")}
      {E.note("Connecting does not publish a menu or import old sales.")}
      {E.btn("Connect Square", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Square locations",
    job: "Map each Square location to one MGR location and sales channel",
    reads: "list_pos_locations · list_locations · list_sales_channels [design]",
    writes: "set_pos_location_mapping [design]",
    states: [["mapped", "two locations ready"], ["unmapped", "sales cannot reconcile", 1], ["claimed", "an MGR location cannot be claimed twice", 1]],
    spec: "Each provider location needs both owners before its sales can change inventory.",
    body: (<>
      {E.ttl("Taproom")}
      {E.pick("MGR location", "Taproom")}
      {E.pick("Sales channel", "Taproom")}
      {E.ttl("Warehouse")}
      {E.pick("MGR location", "Warehouse")}
      {E.pick("Sales channel", "DTC")}
      {E.ttl("Third location · needs mapping")}
      {E.pick("MGR location", "Select location")}
      {E.pick("Sales channel", "Select channel")}
      {E.btn("Save mappings")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Square → QuickBooks connector",
    job: "Acknowledge that Square already posts taproom revenue to QuickBooks",
    reads: "get_pos_integration_health [design]",
    writes: "acknowledge_pos_accounting_connector [design; no external write]",
    states: [["detected", "acknowledgement required", 1], ["acknowledged", "health warning dismissed"]],
    spec: "Acknowledging records awareness only. MGR does not configure or disable Square's connector.",
    body: (<>
      {E.note("Square already posts taproom sales to QuickBooks Online as sales receipts.")}
      {E.info("MGR pushes wholesale invoices only. Confirm with your accountant that the two revenue streams stay separate.")}
      {E.btn("Understood", "g")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "Disconnect Square",
    job: "Confirm the external effects of disconnecting Square",
    reads: "get_pos_integration_health [design]",
    writes: "disconnect_pos_installation [design]",
    states: [["confirmed", "installation disabled and token purged"]],
    spec: "The confirmation names what stops and what remains so reconnecting can reuse mappings.",
    body: (<>
      {E.note("Stops: menu publishing, availability updates and sales sync.")}
      {E.info("Stays: MGR stock, location mappings, sales history and published item ids.")}
      {E.btn("Disconnect Square", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Menu",
    job: "One catalog, published to every destination that sells from it",
    reads: "get_pos_menu [design; derived from brands × formats × taproom stock]",
    writes: "publish_pos_menu [design; upsert by MGR key, provider-neutral] · set_pos_price_override [design; nullable, per pos_location]",
    states: [["derived", "every row is a brand, a format and stock on hand"], ["override", "one row priced away from its format default", 1], ["no price anywhere", "no format default and no override: that row cannot publish", 1], ["out of stock", "row retires itself; price and provider id are kept"], ["provider rejected", "the row keeps its edit; nothing half-published", 1], ["second location", "same catalog, scoped · its own price and stock", 1], ["present at one only", "the other location never sees the row", 1], ["one destination", "a row can publish to Square and not the website", 1], ["website beer unmapped", "adopted by matching it to a brand once", 1]],
    redrawn: true,
    spec: <>This was an authoring surface and is now a read-out. Brand, format and availability are all derived (brand from what is in the bin, formats from the brand, availability from taproom stock), so publishing is zero-touch and a new brand reaches the register the moment stock lands. Retail resolves as the location’s own price override, falling back to the format’s default retail price, which is why the table shows the inherited number and names its Source: an exception has to be legible, or a stale price from last summer becomes silently authoritative. The override column stays empty unless someone sets it, so a format-wide price change actually propagates; writing the default into every row on publish would freeze each one at its first price, which is the failure mode this drawing exists to prevent. Publish changes survives because MGR still owns when the provider copy is refreshed. Location is a scope rather than a column: Square publishes one item with per-location presence on the variation, so MGR maintains one catalog and varies where each row appears; two parallel menus would fight that model and double every retire. Everything under the switcher is read for one location: stock, availability, and the price override that is keyed by POS location. A column would only serve a cross-location comparison nobody performs, while every action here is taken against one register. Renamed from POS menu: the register is no longer the only destination. The website is the third consumer of this catalog after Square and QuickBooks, not an integration of its own: a bespoke web feed would produce a third answer to what are we selling right now, and would leak unannounced beer, which is the same ownership boundary the Square item library taught. So the website is a read client keeping no copy, and the sync logic it runs today exists only because it keeps one. Its existing beers are adopted exactly as pre-integration Square items are: matched to a brand once, then maintained from here, so nothing vanishes from a public page the day MGR connects. Transport is deliberately not drawn: a menu changes a handful of times a day, so a cached read of the published rows is as fresh as a socket per visitor without opening an anonymous realtime path. Destination-native rows sit <i>below</i> that button rather than in the table: position is what says they are outside the publishable set, which no label reliably does. They appear at all because an unmapped taproom item is the reason a sale fails to reconcile, and Map is the only action MGR ever offers against a row it does not own.</>,
    body: (<>
      {E.back("More", "Menu")}
      {E.chips(["Taproom", "Warehouse"], 0)}
      {E.info("One catalog, scoped to a location. Price and availability are read for the location above.")}
      {E.tbl(["Brand · format", "Retail", "Source", "Publishes to"], [["Hazy IPA · pint", "$7.00", "format", "Square · Website"], ["Hazy IPA · crowler", "$9.00", "format", "Square"], ["Pils · pint", "$6.50", "override", "Square · Website"], ["Pils · crowler", "$12.00", "format", "Square"]])}
      {E.row("Stout · pint", "no taproom stock · retired", "off", "w")}
      {E.info("Pils · pint is the only override: $6.50 against a format default of $7.00. Every other row follows its format.")}
      {E.btn("Publish changes")}
      {E.ttl("Also on these destinations")}
      {E.info("Created in Square or on the website, not by MGR. MGR never renames, prices or retires these; it maps them so their sales reconcile.")}
      {E.row("Guest cider · pint", "not mapped · its sales cannot reconcile", E.act("Map"), "w")}
      {E.row("Pretzel", "not mapped · no MGR stock behind it", E.act("Map"))}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "POS item",
    job: "Override one price; everything else is inherited from the format",
    reads: "get_pos_menu_item [design]",
    writes: "set_pos_price_override [design; nullable override keyed by pos_location] · clear_pos_price_override [design]",
    states: [["inherited", "no override · the format price is what publishes"], ["overridden", "this row is priced away from the default", 1], ["reset", "override cleared · the row rejoins the format price"], ["no price at all", "no format default and no override · Save stays disabled", 1], ["per location", "a second taproom overrides the same row separately", 1], ["format changed", "conversion and premise follow the format, not this sheet"], ["tax preserved", "publishing never clears the provider’s tax assignment", 1]],
    redrawn: true,
    spec: "Against the brand and format schema, Serving and Premise are no longer authored here. A format owns its conversion (a pint is 1/124 of a ½ bbl) and its premise, so this sheet reads them instead of asking again; the same fact stored twice is exactly the coupling the channel change had to unwind. What is left is the one thing inventory cannot answer: a price exception. Optional and keyed by POS location, so an empty override lets a format-wide change propagate and the Warehouse can price the same brand differently from the Taproom without either row copying a number. Availability stays a rule, not a per-keg switch: MGR retires the row when taproom stock runs out and re-publishes under the same provider id when it returns. Price still lands on the variation rather than the item, so an override writes to the format’s variation id.",
    body: (<>
      {E.fld("Brand", "Hazy IPA")}
      {E.fld("Format", "pint · poured")}
      {E.fld("Pours from", "½ bbl keg · Taproom")}
      {E.fld("Serving", "1/124 of a ½ bbl · 0.004032 · from the format")}
      {E.fld("Premise", "On-premise · from the format")}
      {E.fld("Tax", "On-premise rate · held by the provider")}
      {E.fld("Format price", "$7.00")}
      {E.fld("Price override", "$6.50")}
      {E.btn("Reset to format price", "g")}
      {E.fld("Availability", "sells while taproom stock remains")}
      {E.info("Leave the override empty and this row follows the format. A price set here applies to this location only.")}
      {E.btn("Save override")}
    </>),
  },
  // Revision 2 (schema §16, designed 2026-09-02, not migrated). Every commit
  // here is drawn gated — the frames exist so the interface can settle before
  // the one-pass migration, per §16's own build order — and each names its
  // gate in `writes`, which is where every other gate in this file is found.
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Sale channels",
    job: "Name the channels this brewery sells through and what each one is taxed as",
    reads: "list_sale_channels [design; §16.3 + PR #42]",
    writes: "create_sale_channel · update_sale_channel · delete_sale_channel [SCHEMA-GATE: revision 2 §16.3, sale_channels replaces the sale_channel enum]",
    states: [["in use", "delete refused by on delete restrict · human copy, not a 23503", 1], ["seeded", "four defaults arrive with the brewery"], ["inherit", "a customer with no override takes the channel default"]],
    spec: "The channel carries a name and a default tax treatment and nothing else: removal classification stays on the movement type, which is why #42 rejected giving the channel a removal flag or a required-destination-state flag. Resolution order is customer override → channel default, and the resolved value is frozen onto the movement at write time so editing a customer in March never restates January.",
    body: (<>
      {E.back("Settings", "Sale channels")}
      {E.nav("Wholesale", "taxable · 118 movements")}
      {E.nav("Taproom", "taxable · 402 movements")}
      {E.nav("DTC", "taxable · 34 movements")}
      {E.nav("Export", "export · 6 movements")}
      {E.gated("Add channel", "isn’t available yet: channels are still a fixed list")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Channel",
    job: "Create or edit one sale channel and its default tax treatment",
    reads: "get_sale_channel [design; §16.3]",
    writes: "create_sale_channel · update_sale_channel · delete_sale_channel [SCHEMA-GATE: revision 2 §16.3]",
    states: [["new", "name and tax treatment required"], ["in use", "delete is refused", 1]],
    body: (<>
      {E.inp("Channel name · Export")}
      {E.chips(["taxable", "export", "vessel supplies", "research", "transfer in bond"], 1)}
      {E.info("Customers may override this. Sales without a customer take the channel default.")}
      {E.note("A channel with movements cannot be deleted.")}
      {E.gated("Save channel", "isn’t available yet: channels are still a fixed list")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Formats",
    job: "Type barrels per unit once, on the atomic format, and derive every shape above it",
    reads: "list_formats [design; §16.2] · get_format_components [design; §16.2a]",
    writes: "create_format · update_format · replace_format_components [design; one RPC replaces the child set] · replace_format_bom [SCHEMA-GATE: revision 2 §16.2/16.2a/16.12: formats, format_components and format_bom supersede skus.bbl_per_unit and sku_bom]",
    states: [["atomic", "carries a typed barrels per unit"], ["children missing", "a composed format cannot be created before its children", 1], ["poured", "never holds stock · a ratio back to the keg"], ["in use", "editing a format never moves frozen movement bbl"]],
    spec: "Barrels per unit is the basis of all TTB math, so exactly one row types it. Only atomic formats carry a volume; composed ones compute it from their component formats, which is also what makes repack (§16.10) validated rather than asserted. The basis says only whether the shape holds stock: a pour is a component row with a fractional quantity, not a different kind of thing. Each BOM line's on-break disposition is what the repack sheet reads. OPEN (§16.16 q1): fully sized formats, drawn here, or shape-only.",
    body: (<>
      {E.back("Settings", "Formats")}
      {E.tbl(["Format", "Basis", "bbl / unit", "From"], [["16 oz can", "packaged", "0.00403226", "typed"], ["four-pack", "packaged", "0.01612903", "4 × can"], ["case · 24×16oz", "packaged", "0.09677419", "6 × four-pack"], ["½ bbl keg", "packaged", "0.50000000", "typed"], ["pint", "poured", "0.00403226", "1/124 × ½ bbl"]])}
      {E.gated("Add format", "isn’t available yet: package facts still live on each SKU")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Format",
    job: "Create or edit one atomic or composed package format",
    reads: "get_format [design; §16.2] · get_format_components [design; §16.2a]",
    writes: "create_format · update_format · replace_format_components · replace_format_bom [SCHEMA-GATE: revision 2 §16.2/16.2a/16.12]",
    states: [["atomic", "barrels per unit is typed"], ["composed", "volume derives from child formats"]],
    body: (<>
      {E.inp("Format name · case · 24×16oz")}
      {E.chips(["packaged", "poured"])}
      {E.fld("Volume", "0.09677419 bbl · derived · read-only")}
      {E.ttl("Composition")}
      {E.row("four-pack", "quantity 6", E.act("Remove"))}
      {E.row("Add component", "child format · quantity", E.act("Add"))}
      {E.ttl("Packaging BOM")}
      {E.tbl(["Material", "Qty", "On break"], [["Case tray", "1", "return to stock"], ["PakTech", "0", "consumed"]])}
      {E.info("One level only: a case breaks into four-packs, never straight into cans.")}
      {E.gated("Save format", "isn’t available yet: package facts still live on each SKU")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price lists",
    job: "See customer price tiers and open the prices each tier owns",
    reads: "list_price_lists",
    writes: "none [creation and pricing happen on Price tiers]",
    states: [["unused", "a tier with no customers can still be edited"], ["empty", "no price lists yet: Create price list is the only action"]],
    spec: "Reached from Catalog. Each row names its next action and opens Price tiers; Create price list opens the same surface for a new tier.",
    body: (<>
      {E.back("Catalog", "Price lists")}
      {E.btn("Create price list")}
      {E.row("Wholesale · standard", "18 customers · 12 priced formats", E.act("Edit prices"))}
      {E.row("Wholesale · distributor", "3 customers · 12 priced formats", E.act("Edit prices"))}
      {E.row("Taproom", "no customers · 8 priced formats", E.act("Edit prices"))}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price tiers",
    job: "Price a format once per tier and override only the exceptions",
    reads: "list_price_lists [design; + channel_id §16.4] · get_price_list [design; formats and SKU overrides]",
    writes: "create_price_list · update_price_list · set_price_list_format · set_price_list_item · clear_price_list_item [SCHEMA-GATE: revision 2 §16.4: price_lists.channel_id and price_list_formats]",
    states: [["inherited", "the format price is what the customer sees"], ["overridden", "one brand × format priced away from the tier", 1], ["poured", "a pour is priceable here and is not a SKU"], ["no price", "neither a format default nor an override · the line cannot be sold", 1]],
    spec: "Price lists are already tiers and the customer's assigned price list already assigns them; revision 2 adds the channel and makes a format priceable, so a taproom pour (which is not a SKU) can be priced at all. Drawn format-default with a per-SKU override, matching Menu and POS item, which already read “format default” and offer Reset to format price. §16.16 q2 leaves the direction open; drawing it the other way would make those two shipped frames inconsistent.",
    body: (<>
      {E.back("Price lists", "Wholesale tier")}
      {E.fld("Tier name", "Wholesale · standard")}
      {E.fld("Channel", "Wholesale")}
      {E.ttl("Format defaults")}
      {E.tbl(["Format", "Price", "Source"], [["½ bbl keg", INV.hazyPrice, "tier default"], ["sixtel", "$95.00", "tier default"], ["case · 24×16oz", INV.pilsPrice, "tier default"]])}
      {E.ttl("Brand × format overrides")}
      {E.row("Barrel-aged Stout · ½ bbl keg", `$240.00 · against a ${INV.hazyPrice} default`, E.act("Edit"), "w")}
      {E.row("Add override", "brand · format · price", E.act("Add"))}
      {E.info(`All halves are ${INV.hazyPrice}, except the barrel-aged one. Clear an override and the row rejoins the tier.`)}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Override",
    job: "Price one brand and format away from its tier default",
    reads: "get_price_list [design; §16.4]",
    writes: "set_price_list_item · clear_price_list_item [SCHEMA-GATE: revision 2 §16.4]",
    states: [["overridden", "customer sees this price"], ["cleared", "format default applies"]],
    body: (<>
      {E.pick("Brand", "Barrel-aged Stout")}
      {E.pick("Format", "½ bbl keg")}
      {E.inp("Price · $240.00")}
      {E.info(`Clear this override to use the ${INV.hazyPrice} format default.`)}
      {E.btns([["Clear override", "g"], "Save override"])}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Location bins",
    job: "Subdivide a location without making every query carry an or-null",
    reads: "list_locations · list_bins [design; §16.6]",
    writes: "create_bin · update_bin · delete_bin [SCHEMA-GATE: revision 2 §16.6: bins, inventory_movements.bin_id not null, taproom_pars re-keyed on bin]",
    states: [["default bin", "created with the location · cannot be deleted", 1], ["in use", "a bin holding stock cannot be deleted", 1], ["par on a bin", "keep 4 cases in the to-go fridge"]],
    spec: "Every location gets a default bin created with it, so the bin is required everywhere it appears (movements, pars, menus) and no on-hand or availability query carries a nullable branch. One setup artifact bought against a whole class of null handling. Bins are physical subdivisions a menu can read; they are explicitly not tap lines (§16.8), which are hand-maintained state nothing downstream validates.",
    body: (<>
      {E.back("Settings", "Taproom · bins")}
      {E.gated("Taproom", "the default bin · created with the location and cannot be removed")}
      {E.nav("Walk-in", "38 cases · 12 kegs")}
      {E.nav("To-go fridge", "22 cases · par 4 cases")}
      {E.gated("Add bin", "isn’t available yet: a location is still one undivided space")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Bin",
    job: "Create or edit one physical subdivision of a location",
    reads: "get_bin [design; §16.6]",
    writes: "create_bin · update_bin · delete_bin [SCHEMA-GATE: revision 2 §16.6]",
    states: [["default", "cannot be removed", 1], ["in use", "delete is refused", 1], ["empty", "safe to remove"]],
    body: (<>
      {E.inp("Bin name · To-go fridge")}
      {E.pick("Kind", "Packaged storage")}
      {E.inp("Par · 4 cases · Hazy IPA")}
      {E.info("A brewery that never subdivides sees one bin and ignores it.")}
      {E.note("Tap lines are not bins. The tap board owns those.")}
      {E.gated("Save bin", "isn’t available yet: a location is still one undivided space")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Repack",
    job: "Break bulk as a paired, bbl-conserving pair of legs, never a loss and a gain",
    reads: "get_format_components [design; §16.2a] · get_material_on_hand",
    writes: "record_repack [SCHEMA-GATE: revision 2 §16.10: repack movement type, shared ref, abs(sum(bbl)) < 0.000001 over the ref]",
    states: [["offered", "composition knows a case yields six four-packs · nobody types both halves"], ["breakage", "−1 case · +5 four-packs · +1 loss keeps the invariant absolute", 1], ["materials", "case tray returns to stock, PakTech is consumed · per-repack override"]],
    spec: "An adjustment cannot express a break: it has no way to pair the two halves, so the break reads as an unexplained loss beside an unexplained gain. The outbound leg's bbl is derived from the inbound leg's frozen total rather than recomputed from barrels per unit (rounding each leg independently leaves −0.00000001 on a 24×16oz case), and the constraint carries a tolerance to catch a hand-entered repack without rejecting a legitimate one. Build-direction repack is out of scope; the whole repack is one RPC sharing one ref so beer and materials cannot disagree.",
    body: (<>
      {E.fld("Break", "Hazy IPA · case · 24×16oz")}
      {E.fld("Location · bin", "Warehouse · Walk-in")}
      {E.num("1", "case · amounts are entered positive")}
      {E.tape([["−1 case · repack", "0.09677419 bbl"], ["+6 four-pack · repack", "derived from the case total"], ["Case tray ×1", "return to stock"], ["PakTech ×6", "consumed"]])}
      {E.info("Preview: conserves 0.09677419 bbl · same location and bin · not a TTB removal")}
      {E.fld("Damaged on break", "0 four-pack · records as loss")}
      {E.pin(<>
        {E.pad()}
        {E.gated("Record repack", "isn’t available yet: breaking a case has nowhere correct to land")}
      </>)}
    </>),
  },
  // ---- The external venues. Not MGR screens: what QuickBooks, Square and Slack
  // show when MGR writes into them, drawn in each product's own design language
  // (components/mgr/venue.tsx) so an integration contract stays legible. Ported
  // from the wireframes file, which is now retired for these too.

  // QuickBooks — what MGR's push produces, rendered by Intuit. Slice 1, step 5.
  {
    step: 5, slice: 1, venue: { name: "QuickBooks Online", title: `Invoice ${INV.no}`, actions: "Edit invoice" },
    name: "Pushed invoice",
    job: "What the accountant opens after one shipment invoices, and the two steps the push does not perform",
    reads: "none [QuickBooks renders; MGR wrote it]",
    writes: "push_invoice [design; requestid, online-only, AllowOnlineACHPayment + AllowOnlineCreditCardPayment]",
    states: [["not sent", "created by MGR; QuickBooks has emailed nobody", 1], ["accepted", "the QuickBooks invoice id is stored on the MGR invoice"], ["rejected", "the QuickBooks sync error is shown in MGR; nothing created here", 1], ["response lost", "the same requestid returns the first invoice, never a second"], ["tax intent missing", "AST does not engage and the invoice books at 0.00 tax", 1], ["no customer email", "push refuses; an invoice without one can never be paid online", 1], ["viewed", "the customer opened it, a signal MGR has no column for", 1]],
    spec: "Drawn as QuickBooks actually presents it: the Sales transactions list with a right sidebar, because QuickBooks has no separate full-page record. Every Product/Service line resolves through the SKU's QuickBooks item reference and the bill-to through the customer's QuickBooks customer reference. MGR sends tax intent, never tax amounts: Intuit requires a transaction-level tax code (TxnTaxCodeRef) to opt the transaction into Automated Sales Tax, and an unmarked line is treated as TAX, so a keg deposit must carry TaxCodeRef NON explicitly or it books as taxable revenue. The header carries the second finding: a pushed invoice reads Not sent. Creating and delivering are different acts and the push performs only the first.",
    body: (<>
      {X.stat("Due in 30 days (Not sent)", 1)}
      {X.amt("Total due", INV.major, INV.cents)}
      {X.when("Invoice date", INV.invoiceDate)}
      {X.when("Due date", INV.due)}
      {X.sec(INV.customer, <>{X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"])}{X.link("ap@ridgeline.example")}</>)}
      {X.sec("Invoice activity", X.life(["Opened", "Sent", "Viewed", "Paid"], 1))}
      {X.sec("Products and services", X.rows([["Hazy IPA · ½ bbl · TAX", INV.hazyAmount], ["Pils · 16 oz case · TAX", INV.pilsAmount], ["Keg deposit · NON", INV.depositAmount], ["Total", INV.total]]))}
    </>),
  },
  {
    step: 5, slice: 1, group: "QuickBooks Online", venue: { name: "QuickBooks Online", title: "Payment", actions: "Edit" },
    name: "Payment",
    job: "The accountant records payment here; MGR never offers a Mark paid verb",
    reads: "qbo sync job [design; writes invoices.paid_at]",
    writes: "none [no MGR user action]",
    states: [["paid", "the invoice's paid date is set on the next sync"], ["fee deducted", "the deposit is smaller than the payment", 1], ["partial", "balance drops; the AR row stays due", 1], ["sync lagging", "MGR AR shows the last synced balance", 1]],
    spec: "This frame justifies an absence: there is deliberately no Mark paid button anywhere in MGR. The paid date and the QuickBooks balance arrive from the sync job only, which is why the AR list stops showing an invoice as due without anyone in the brewery doing anything. It also carries a number MGR does not model: QuickBooks Payments deducts a processing fee before deposit, so the bank deposit never equals the invoice. MGR reconciles against the QuickBooks balance, not the deposit, and must not read the gap as a short payment.",
    body: (<>
      {X.stat("Paid")}
      {X.amt("Amount paid", INV.major, INV.cents)}
      {X.when("Payment date", "9/28/2026")}
      {X.sec(INV.customer, <>{X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"])}{X.rows([["Phone", "(610) 933-7181"]])}</>)}
      {X.sec("Transaction Details", <>{X.sub("Payment Details", [`QuickBooks Payments-Bank *8837 | Fee: ${INV.fee}`, INV.total])}{X.sub("Deposit Details", ["JPMORGAN CHASE BANK, NA | *0753"])}</>)}
      {X.more("More info")}
    </>),
  },
  {
    step: 5, slice: 1, venue: { name: "QuickBooks Online", title: "Credit memo CM-0068", actions: "Edit" },
    name: "Credit memo",
    job: "A return or keg deposit refund as it lands against the customer",
    reads: "none",
    writes: "create_credit_memo [design; kind=credit_memo, own requestid]",
    states: [["applied", "reduces the customer balance here"], ["unapplied", "sits as available credit"], ["rejected", "the QuickBooks sync error is shown on the MGR credit row", 1], ["deposit line untaxed", "TaxCodeRef NON, or it refunds phantom tax", 1]],
    spec: "Created by Return shipment or a keg return, never free-form; the plan lists free-form credit memos as deliberately deferred. Returning an empty keg posts the deposit refund and the keg event in one RPC, so the credit and the fleet balance cannot disagree. The deposit line carries TaxCodeRef NON: an unmarked line defaults to TAX and would refund tax that was never charged.",
    body: (<>
      {X.stat("Applied")}
      {X.amt("Total credit", INV.creditMajor, "00")}
      {X.when("Credit date", "9/12/2026")}
      {X.when("Applied to", `Invoice ${INV.no} · original ${INV.total}`)}
      {X.sec(INV.customer, X.sub("Billing address", ["114 Bridge St.", "Phoenixville, PA  19460"]))}
      {X.sec("Products and services", X.rows([["Pils · 16 oz case · TAX", "$76.00"], ["Keg deposit refund · NON", "$30.00"], ["Total", INV.credit]]))}
      {X.more("More info")}
    </>),
  },
  {
    step: 5, slice: 1, group: "QuickBooks Online", venue: { name: "QuickBooks Online", title: "Invoice · not created" },
    name: "Push rejected",
    job: "What QuickBooks refuses when a SKU carries no usable item reference",
    reads: "none",
    writes: "push_invoice [design; rejected, no partial invoice]",
    states: [["failed", "MGR AR row reads push failed", 1], ["unmapped", "the SKU carries no QuickBooks item reference"], ["archived in QuickBooks Online", "mapped, but the item went inactive: same error, different fix", 1], ["never partial", "no half invoice is left behind here"]],
    spec: "Drawn because the failure is external and the recovery is not. MGR stores the raw provider reason as the invoice's sync error and leaves its sync status failed; the row stays in AR. Re-pushing reuses the same requestid, so a fixed mapping cannot produce a second invoice. Two causes share this one message (the SKU was never mapped, or the QuickBooks item has since gone inactive) and the recovery differs, so the error copy must not assume the first. Nothing appears in the list behind this panel, which is the point.",
    body: (<>
      {X.err("Invalid reference", "Invalid Reference Id : Item element id 0 not found.")}
      {X.sec("Request", X.rows([["Order", "ORD-0241"], ["Failed line", "Stout · ⅙ bbl"], ["Created in QuickBooks", "Nothing"]]))}
      {X.note("Either the SKU has no QuickBooks item reference, or the item it points at is archived in QuickBooks. Map it here or reactivate it there, then re-push the same request.")}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "QuickBooks Online", title: "Sales receipt", actions: "Edit", selected: "receipt" },
    name: "Square sales receipt",
    job: "Proof that Square's own QuickBooks sync books a daily receipt MGR must not double-count",
    reads: "none [Square's QuickBooks integration wrote it]",
    writes: "none [MGR never pushes taproom sales]",
    states: [["daily total", "one receipt per location per day, not one per sale"], ["tips item", "Square posts a tips line MGR has no concept of", 1], ["double count", "MGR pushing taproom revenue here would book it twice", 1]],
    spec: "Drawn to mark a boundary MGR must not cross. Square's own QuickBooks connection already books taproom revenue as a daily sales receipt, so MGR ingesting Square sales is for inventory only; it must never push that revenue to QuickBooks as well. The tips item is the tell: it is Square's line, not MGR's, and MGR has no concept that would produce it.",
    body: (<>
      {X.stat("Paid")}
      {X.amt("Amount", "59", "73")}
      {X.when("Receipt date", "09/03/2026")}
      {X.sec("Square customer")}
      {X.sec("Sales receipt activity", X.sub("Paid", ["Credit Card"]))}
      {X.sec("Products and services", <>{X.rows([["4-Pack Beer To Go", "$19.00"], ["Draft Sales", "$30.00"], ["Square sale tips item", "$7.79"]])}{X.link("More details")}</>)}
      {X.more("More info")}
    </>),
  },

  // Square — records MGR reads, not writes. Slice 7, step 7.
  {
    step: 7, slice: 7, group: "POS",
    venue: {
      name: "Square", nav: "pay", on: "Transactions",
      panel: (<>
        {X.h("$14.84 Payment", "Sep 1, 2026 10:32 pm")}
        {X.meta([["", "Point of Sale"], ["Collected at", "Taproom"], ["Device", "Square Register 0305"], ["Order Source", "Register"]])}
        {X.sect("For here")}
        {X.li([["Hazy IPA (Pint)", "$14.00", "$7.00 × 2"]])}
        {X.tot([["Subtotal", "14.00"], ["Sales Tax Zelienople", "0.84"], ["Total", "14.84", 1], ["Cash", "14.84"]])}
        {X.note("MGR mapping: the Square Taproom location uses the Taproom sales channel. An unmapped variation blocks reconciliation rather than guessing a quantity.")}
      </>),
    },
    name: "Taproom sale",
    job: "The sale MGR ingests, and the truth the weekly count is checked against",
    reads: "sync_pos_sales [design; slice 7, idempotent per sale id]",
    writes: "none [Square owns the sale]",
    states: [["synced", "depletion posted once per sale id"], ["unmapped item", "reconciliation stays disabled until mapped", 1], ["refund", "arrives as its own line, credited back"], ["disconnected", "no expected number · the count still posts depletion"], ["tips line", "Square posts a tips item MGR has no concept of", 1]],
    spec: "Note the direction: ingesting a sale posts nothing to the ledger; it is the expected number the weekly count is measured against, and the count is what removes the beer. Drawn in the real container: a transaction is a right panel over Transactions, not a free-standing receipt. Read the list, not just the panel: a row summarises as an item name and a count, no SKU and no unit, so the list can never be the reconciliation source. Only the panel carries the lines, and even there the serving is a variation.",
    body: (<>
      {sqTxnHead()}
      {X.day("Tuesday, September 1, 2026", "$1,564.63")}
      {X.txns([["CASH", "10:32 pm", "Hazy IPA (Pint) × 2", "$14.84", "Taproom", 1], ["⋯", "9:59 pm", "No Sale", "$0.00", "Warehouse"], ["CASH", "9:44 pm", "Hazy IPA (Pint), Pils (Pint), Stout (Pint)", "$33.02", "Warehouse"], ["VISA", "9:16 pm", "Pils (Pint) × 3", "$26.67", "Warehouse"], ["VISA", "9:12 pm", "Pils (Can) × 2, Hazy IPA (Can) × 2, Stout (Can) × 2, Pils (Half) × 2, Hazy IPA To Go (Single) × 2, Saison…", "$141.23", "Warehouse"], ["AMEX", "8:52 pm", "Stout (Taster)", "$7.62", "Warehouse"], ["CASH", "8:43 pm", "Hazy IPA To Go (4 Pack)", "$28.89", "Warehouse"]])}
    </>),
  },
  {
    step: 7, slice: 7, group: "POS",
    venue: {
      name: "Square", nav: "pay", on: "Transactions",
      panel: (<>
        {X.h("$12.72 Refund", "Sep 1, 2026 10:51 pm")}
        {X.pill("Refunded", 1)}
        {X.meta([["", "Point of Sale"], ["Collected at", "Taproom"], ["Device", "Square Register 0305"], ["Original sale", "#5g4P"]])}
        {X.sect("Refunded items")}
        {X.li([["Pils · crowler", "−12.00", "$12.00 × 1"]])}
        {X.tot([["Sales Tax Zelienople", "−0.72"], ["Total refunded", "−12.72", 1]])}
        {X.note("Reaches MGR through the same reconcile RPC as the sale.")}
      </>),
    },
    name: "Refund",
    job: "The refund line that becomes a positive inventory adjustment in MGR",
    reads: "sync_pos_sales [design; refund lines included]",
    writes: "none [Square owns the refund]",
    states: [["previewed", "MGR shows a positive adjustment, not a negative sale"], ["partial refund", "only the refunded units credit back"], ["unmapped", "same block as the sale it reverses", 1], ["same list", "a refund is a row in Transactions like any payment"]],
    spec: "The reconcile list includes refund lines and previews the inventory credit as a positive adjustment. Drawing it as a negative sale would invite a signed-quantity bug of exactly the kind the movement vocabulary exists to prevent. A refund is not a separate surface in Square; it is another row in the same Transactions list, opening the same panel, which is why MGR ingests both through one call rather than two.",
    body: (<>
      {sqTxnHead()}
      {X.day("Tuesday, September 1, 2026", "$1,564.63")}
      {X.txns([["VISA", "10:51 pm", "Refund · Pils (Crowler)", "−$12.72", "Taproom", 1], ["CASH", "10:32 pm", "Hazy IPA (Pint) × 2", "$14.84", "Taproom"], ["VISA", "9:16 pm", "Pils (Pint) × 3", "$26.67", "Warehouse"], ["AMEX", "8:52 pm", "Stout (Taster)", "$7.62", "Warehouse"]])}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "Square" },
    name: "Item library",
    job: "Which rows MGR maintains, and which it must never touch",
    reads: "none",
    writes: "none [mapping is written in MGR, not here]",
    states: [["MGR-owned", "published, updated and retired by MGR"], ["taproom-owned", "left alone; sales still ingest if mapped"], ["unmapped taproom item", "reconcile disabled for that item only", 1], ["renamed in Square", "id holds; ownership survives"], ["ownership is invisible here", "Square has no owner column; MGR infers it from the stored item id", 1]],
    spec: "Drawn to fix a boundary before publishing can cross it: a taproom rings food, merch and guest taps MGR knows nothing about. MGR maintains only the rows it published and leaves every other one alone; retire must never walk the whole catalog. Items predating the integration are adopted by mapping once, then maintained like the rest. The shading here is ours, not Square's: the real library has no ownership column, so MGR can only tell its rows apart by holding the item id.",
    body: (<>
      {sqItemFilters()}
      {X.items([[1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [1, "Hazy IPA To Go", "Off-Prem Package", "2 locations", "ea", "Available", "$6.50 - $24.00/ea", "mgr"], [1, "Pils", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [0, "Pretzel", "Events etc.", "Warehouse", "ea", "Available", "$7.00/ea", ""], [0, "Guest cider", "", "Taproom", "ea", "Available", "Variable", ""], [0, "Logo tee", "", "2 locations", "ea", "Available", "$25.00/ea", ""]])}
      {X.note("Shaded rows carry an item id MGR wrote. Everything else is the taproom’s and is never renamed, hidden or deleted by MGR.")}
    </>),
  },
  {
    step: 7, slice: 7, group: "POS", venue: { name: "Square" },
    name: "Published item",
    job: "A brand becomes a Square item, its formats become variations, and price lives on the format",
    reads: "get_taproom_sellable [design]",
    writes: "publish_pos_item [design; upsert by MGR key, writes back skus.square_item_id + variation ids]",
    states: [["created", "item id and variation ids stored on the SKU"], ["variation added", "a new serving is a new variation, not a new item", 1], ["renamed in MGR", "same item updated, ids hold"], ["collision", "existing Square item adopted, never duplicated", 1], ["tax assignment", "merged, never replaced; a republish must not retax", 1], ["off-premise twin", "its own item and id; same source SKU"]],
    spec: "DISCOVERED from a live library, and it breaks a modelling assumption: a Square item does not carry a price. Variations do. That is why the Price column reads as a range: it is the spread across a pint, a crowler and whatever else hangs off the item, and Variable means the spread is open. So the item id alone is not sufficient: sales report at the variation level, and the per-sale conversion MGR depletes against belongs to the variation, not the item. Publishing must store an id per serving, or a pint and a crowler collapse into one number.",
    body: (<>
      {sqItemFilters()}
      {X.items([[1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"], [1, "Hazy IPA To Go", "Off-Prem Package", "2 locations", "ea", "Available", "$6.50 - $24.00/ea", "mgr"]])}
      {X.note("MGR mapping: item FQ7K2N4M contains Pint 3YJ6Q8TX at $7.00, Crowler C4PV9K2D at $9.00, and Taster W8N3R6LA at $6.00. Square keeps these variations inside the item; MGR stores each opaque id because conversion differs by variation.")}
    </>),
  },
  {
    step: 7, slice: 7, venue: { name: "Square" },
    name: "Retired item",
    job: "Beer that stopped being available leaves the register without losing its history",
    reads: "get_taproom_sellable [design]",
    writes: "retire_pos_item [design; clears present_at_location_ids, never a delete]",
    states: [["retired", "off the register; past sales still resolve"], ["back in stock", "re-published under the same id, no churn"], ["sold while retiring", "the sale still ingests; the id never went away"], ["delete", "not offered; it would break prior orders", 1], ["variation retired", "one serving can go while the item stays", 1]],
    spec: "The removal half of maintenance, and deliberately not a delete. Deleting a catalog object breaks the orders that reference it and destroys the id the sales ingest maps through, so last month stops reconciling. Clearing the location takes it off the register just as completely, which is why Locations reads none and Status flips rather than the row disappearing. Because price and serving live on variations, retirement has two levels: a blown keg retires the pint while the crowler keeps selling.",
    body: (<>
      {sqItemFilters("All")}
      {X.items([[1, "Stout", "On-Prem Draft", "none", "ea", "Not available", "$6.00 - $9.00/ea", "mgr"], [0, "• Pint · SQ-8790-V1", "", "none", "ea", "Not available", "$7.00/ea", "mgr var"], [0, "• Crowler · SQ-8790-V2", "", "Taproom", "ea", "Available", "$9.00/ea", "mgr var"], [1, "Hazy IPA", "On-Prem Draft", "Taproom", "ea", "Available", "$6.00 - $9.00/ea", "mgr"]])}
      {X.note("Catalog object kept, prior orders still resolve, reconciliation unaffected. The crowler is still pouring while the pint is retired.")}
    </>),
  },

  // Slack — the three places MGR appears inside Slack. Chat slice, step 8.
  {
    step: 8, slice: "chat", surface: "entry", venue: { name: "Slack", shell: "home", ctx: "App Home" },
    name: "Link identity",
    job: "Link one Slack user to one current brewery staff membership",
    reads: "get_chat_link_status [design]",
    writes: "issue_chat_link_proof · consume_chat_link_proof [design; single-use, authenticated MGR completion]",
    states: [["expired", "link expired · create a new one", 1], ["not staff", "customer and removed membership rejected", 1], ["linked", "show personal queue"]],
    spec: "Slack profile email and display name are never identity. The deep link requires normal MGR authentication.",
    body: (<>
      {S.h("Your MGR work")}
      {S.s("Link your account to see only work your current brewery role permits.")}
      {S.acts([["Link MGR account", "pri"]])}
      {S.ctx("No customer contacts, prices or notes are posted here.")}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "entry", venue: { name: "Slack", shell: "home", ctx: "App Home · Refresh" },
    name: "Personal queue",
    job: "Show the current role-filtered Today projection privately",
    reads: "get_today [design; linked user + current membership] · get_chat_link_status",
    writes: "none",
    states: [["empty", "You’re caught up"], ["loading", "row-shaped skeletons"], ["stale", "refresh removes resolved work"], ["unlinked", "return to link screen", 1]],
    spec: "Rows are rebuilt from owning MGR queries. App Home remains current during quiet hours and is optional for future providers.",
    body: (<>
      {S.h("Today · 4 waiting")}
      {S.sa("*ORD-0231 · Review submitted order*\nrequested Thu · sales", "Open")}
      {S.sa("*ORD-0235 · Pick due*\nships Fri · warehouse", "Open")}
      {S.sa("*Route A · next stop*\nassigned to you · 9:30 AM", "Open")}
      {S.sa("*FV2 · reading overdue*\nlast reading 26 h ago · brewer", "Open")}
      {S.acts([["Open Today in MGR", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "entry", venue: { name: "Slack", shell: "msg", ctx: "MGR", who: "Direct message", at: "8:43 AM" },
    name: "Personal DM",
    job: "Notify once when linked work becomes assigned, due or overdue",
    reads: "get_notification_occurrence [design] · owning Today query revalidation",
    writes: "snooze_notification · set_notification_preference [integration state only]",
    states: [["quiet hours", "queued until personal window opens"], ["resolved", "same message updates to Resolved"], ["retry", "same semantic delivery; no second message"], ["unauthorized", "suppress and unlink if membership ended", 1]],
    spec: "The provider message is a projection. Deleting it does not change MGR. Deep links contain no trusted actor or tenant claims.",
    body: (<>
      {S.h("ORD-0235")}
      {S.s("*Pick due*\nassigned to you")}
      {S.ctx("Pick due · needs attention")}
      {S.acts([["Open pick in MGR", "pri"], ["Snooze"], ["Mute picks"]])}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "entry", venue: { name: "Slack", shell: "msg", ctx: "# mgr-operations", who: "private · 6 members", at: "7:00 AM" },
    name: "Team digest",
    job: "Summarize unresolved work without leaking personal or customer detail",
    reads: "get_chat_operations_digest [design; current unresolved counts]",
    writes: "none",
    states: [["morning", "one message for the local morning window"], ["midday", "the same window message updates"], ["channel invalid", "shared delivery disabled; personal delivery continues", 1]],
    spec: "The destination must stay private, bot-member and non-external. Counts and safe operational labels only; details remain personal.",
    body: (<>
      {S.h("Morning operations · 6 waiting")}
      {S.s("*Submitted orders:* 2 · need sales review\n*Picks due:* 2 · warehouse queue\n*Assigned deliveries:* 1 · next stops ready\n*Fermentation readings:* 1 · overdue")}
      {S.ctx("Details and actions are available in each person’s private MGR App Home.")}
      {S.acts([["Open my MGR work", "pri"]])}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Notification preferences", foot: [["Save preferences", "pri"]] },
    name: "Notification preferences",
    job: "Let a linked user control delivery without changing MGR due state",
    reads: "get_notification_preferences [design]",
    writes: "set_notification_preference · snooze_notification [design; integration state only]",
    states: [["saved", "update App Home and close"], ["invalid hours", "name the correction", 1], ["unsupported provider", "open authenticated MGR fallback", 1]],
    spec: "Snooze and mute affect personal delivery only. App Home and MGR Today still show current work.",
    body: (<>
      {S.toggle("Submitted orders")}
      {S.toggle("Picks due")}
      {S.toggle("Assigned deliveries")}
      {S.toggle("Fermentation readings")}
      {S.select("Quiet hours", "9:00 PM–6:00 AM")}
      {S.ctx("Snooze and mute affect personal delivery only. MGR still shows the work as due.")}
    </>),
  },
  {
    step: 8, slice: "chat", group: "Chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Record fermentation reading", foot: [["Open in MGR"]] },
    name: "Fermentation reading form",
    job: "Preview the first eligible operational modal without enabling it early",
    reads: "get_fermentation_reading_preview [gated; current occupancy/version]",
    writes: "record_fermentation_reading [gated; request replay + version + correction contract]",
    states: [["not yet eligible", "open the MGR reading flow instead", 1], ["stale", "occupancy changed · refresh", 1], ["response lost", "the same request returns the first result"]],
    spec: "Future phase only. Personal destination, canonical preview and explicit Record reading confirmation. A new reading corrects history; prior rows never edit.",
    body: (<>
      {S.ctx("Future phase only")}
      {S.f([["Vessel", "FV2 · Hazy IPA"], ["Last reading", "26 h ago"], ["Reading", "4.2 °Plato · 68 °F"]])}
      {S.dis("Record reading", "Open this reading in MGR for now")}
    </>),
  },
  {
    step: 8, slice: "chat", surface: "sheet", venue: { name: "Slack", shell: "modal", ctx: "Review order", foot: [["Open order in MGR"]] },
    name: "Order confirmation form",
    job: "Show why warning-free order confirmation remains conditional",
    reads: "get_order_confirmation_preview [gated; canonical current preview]",
    writes: "confirm_order [gated; atomic allocation + request replay + expected version]",
    states: [["warning", "ATP, registration, price or source warning routes to MGR", 1], ["stale", "order changed · refresh", 1], ["eligible", "only a warning-free preview can confirm"]],
    spec: "Future phase only. This fixture intentionally carries an ATP warning, so Slack cannot confirm it.",
    body: (<>
      {S.ctx("Future phase only")}
      {S.f([["Order", "ORD-0231 · 3 lines · requested Thu · Submitted"], ["Warning", "Hazy IPA · 16 oz case is 8 units short. Review allocations and restock in MGR."]])}
      {S.dis("Confirm order", "This order needs the full MGR review")}
    </>),
  },
];
