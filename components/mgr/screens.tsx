// components/mgr/screens.tsx — the screen inventory and the source of truth
// for what each MGR screen shows (plan §4, §7); /design renders it. Every
// record is typed; `states` is annotation the gallery captions under the
// frame, never markup inside it. Bodies use only the E vocabulary. Edit the
// records here directly — the HTML wireframe is retired for MGR-venue frames
// and kept only for the Slack/QuickBooks/Square venue drawings.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { MgrIcon } from "@/components/mgr-icon";

export type Tab = "Today" | "Beer" | "Work" | "More";
export type Screen = {
  step: number;
  slice: "all" | "chat" | number;
  /** Staff tab the frame lives under; a Global sheet sets `group` instead. */
  tab?: Tab;
  group?: "Global" | "Entry" | "Portal" | "Desk" | "Chat" | "POS" | "QBO";
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
  /** Entry-screen header (mark + product name); sheets take their title from `name`. */
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
    step: 1, slice: "all", tab: "Today", name: "Today",
    job: "Role-filtered work that opens ready to finish · full-size exemplar at ship scale",
    reads: "get_today [design; delivery rows require assigned warehouse member or admin]", writes: "—",
    states: [["empty", "Nothing waiting · record below"], ["loading", "row-shaped skeletons"], ["error", "Today did not load · Retry", 1], ["offline", "cached rows · writes queue"], ["role hidden", "only relevant permitted work · no blank gaps"]],
    spec: "Drawn as the warehouse persona at honest 16px density. Rows are role-filtered per plan §3. The restock row appears while orders.needs_restock is set and opens Order · detail. Weekly count is gated: disabled with human copy, never a gate name.",
    body: today(<>
      {E.btns(["Pick", "Receive"], "c2")}
      {E.row("3 orders ready", "quantities default to ordered", E.act("Pick"), "w")}
      {E.row("Staged · ORD-0229", "restock 3 Pils cases to Warehouse", E.act("Put back"), "w")}
      {E.row("PO-0142 · Country Malt", "arrives Thu", E.act("Receive"))}
      {E.row("Next delivery · Ridgeline", "your route · stop 1 of 3", E.act("Resume"))}
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
      {E.row("ORD-0231 · Ridgeline", "submitted · ships Thu", E.act("Confirm"), "w")}
      {E.row("ORD-0235 · Teresa’s", "submitted · ships Fri", E.act("Confirm"))}
      {E.row("Pils · 16 oz case", "ATP −6 · 2 orders compete", E.act("Review"), "w")}
      {E.row("Hazy IPA · ½ bbl", "ATP 11 · fine", "")}
      {E.row("Al’s Bar · OH", "destination not registered for Stout", E.act("Review"), "w")}
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
      {E.row("FV3 · Stout", "reading overdue 31 h", E.act("Reading"), "w")}
      {E.row("B-0416 · Hazy IPA v4", "brew day Fri 9/4 · 15 bbl", E.act("Start"))}
      {E.row("RUN-0031 · Hazy cans", "packaged today · close due", E.act("Close"), "w")}
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
      {E.row("Stop 1 · Ridgeline Tap Room", "4 Hazy halves · 6 Pils cases", E.act("Resume"), "w")}
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
      {E.row("Tap 5 · Pils", "nearly out · ~9% left", E.act("Swap"), "w")}
      {E.row("Weekly count", "due Thu · last counted 7 days ago", E.act("Count"))}
      {E.row("Guest cider", "rung in Square · not mapped, blocks reconcile", E.act("Map"), "w")}
      {E.row("Variance · last week", "−0.5 bbl Hazy unaccounted", E.act("Review"))}
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
      {E.row("ORD-0231 · Ridgeline", "submitted · ships today", E.act("Confirm"))}
      {E.row("ORD-0229 · Al’s Bar", "picked · restock 3 Pils staged", E.act("Put back"), "w")}
      {E.row("PO-0142 · Country Malt", "due today", E.act("Receive"))}
      {E.row("Route A", "3 stops · Thu", E.act("Resume"))}
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
    reads: "search_entities [design]", writes: "—",
    states: [["empty", "No matches · change the term"], ["permission", "Results honor row access"]],
    body: (<>
      {E.inp("Search SKU, customer, order, lot, vessel or material")}
      {E.nav("Hazy IPA · ½ bbl", "SKU · ATP 11")}
      {E.nav("ORD-0231 · Ridgeline", "order · 4 × Hazy")}
      {E.nav("L-240831-HZ", "lot · packaged 8/31")}
    </>),
  },
  {
    step: 1, slice: "all", group: "Global", surface: "sheet", name: "Me", job: "Who I am, which brewery, leave",
    reads: "supabase_auth_get_session [platform] · get_first_run_state [design; membership list]", writes: "supabase_auth_sign_out [platform]",
    states: [["dedicated mode", "switcher hidden · one brewery"], ["single membership", "switcher hidden"]],
    spec: "Opened from the header Me control. Brewery switcher renders only in SaaS mode with more than one membership. No notification history, no settings — those live under More.",
    body: (<>
      {E.fld("Signed in as", "maria@demobrewing.com")}
      {E.fld("Role", "warehouse")}
      {E.ttl("Brewery")}
      {E.row("Demo Brewing", "current", "✓", "ok")}
      {E.row("Ridgeline Contract Brewing", "switch", "")}
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
  {
    step: 1, slice: "all", group: "Global", name: "Permission denied",
    job: "A forbidden route says what was refused and offers one way back",
    reads: "— [the denied query never runs]", writes: "—",
    states: [["bookmarked", "direct URL · denied, not empty rows", 1], ["revoked mid-session", "the next command is refused; the shell stays usable", 1]],
    spec: "Plan §3: navigation and Today hide inapplicable actions while the registry and RLS still deny direct URLs and commands — so this frame exists for the URL, not for a link. It names the refusal and the role that would satisfy it, never a blank table, a spinner, or the shape of data the caller may not read.",
    body: (<>
      {E.hd("Back · Today", "No access")}
      {E.note("You do not have access to Invoices.")}
      {E.fld("Signed in as", "dave@ · brewer")}
      {E.fld("Needs", "admin or sales")}
      {E.info("An admin can change your role in Settings › Team.")}
      {E.btns([["Back to Today", "p"], ["Go to Beer", "g"]])}
      {E.sp()}
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
    reads: "—",
    writes: "supabase_auth_sign_in_with_password · supabase_auth_sign_in_with_otp [platform]",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Sign in")}
      {E.inp("email")}
      {E.inp("password")}
      {E.btn("Sign in")}
      {E.btn("Email me a link", "g")}
      {E.row("Forgot password?")}
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
    spec: "Staff lands on Today; a customer lands on portal Order. The token decides; the person never chooses a shell.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Join Demo Brewing")}
      {E.row("Role", "", "warehouse")}
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
    reads: "—",
    writes: "supabase_auth_reset_password_for_email [platform]",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.sp()}
      {E.ttl("Reset password")}
      {E.inp("email")}
      {E.btn("Send reset link")}
      {E.info("Sent state: Check your email.")}
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
    step: 2,
    slice: 1,
    tab: "More",
    name: "Team",
    job: "Roster, roles, pending invites and revocation",
    reads: "list_team_members",
    writes: "update_staff_role [design; single row] · revoke_staff [design; single membership row ends] · invite_staff [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI] · the taproom role [SCHEMA-GATE: revision 2 §16.13/§16.16 q4 — staff_role gains taproom, but P-staff is role-agnostic, so the narrow per-role policies are undesigned]",
    states: [["last admin", "role change refused · keep one admin", 1], ["pending", "invite sent · not yet accepted"], ["permission", "admin only", 1]],
    spec: "From Settings. Role chips call update_staff_role; Remove is copper revoke_staff (Auth user untouched; re-invite is the compensation). The invite stays disabled with the same human copy as first run until its gate closes.",
    body: (<>
      {E.hd("Back · Settings", "Team")}
      {E.row("Maria Alvarez", "maria@ · warehouse", E.act("Change role"))}
      {E.row("Dave Chen", "dave@ · brewer", E.act("Change role"))}
      {E.row("Ted", "ted@ · admin", "you")}
      {E.row("sam@demobrewing.com", "invited Tue · pending", "", "w")}
      {E.btn("Remove selected member", "irr")}
      {E.ttl("Invite")}
      {E.fld("Email · role", "name@brewery.com · sales")}
      {E.chips(["admin", "sales", "warehouse", "brewer"], 1)}
      {E.gated("taproom", "isn’t available yet — what a taproom lead may see is still being drawn")}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.gated("Send staff invite", "isn’t available yet — invitations are being made retry-safe")}
    </>),
  },
  {
    step: 2,
    slice: 1,
    group: "Entry",
    surface: "entry",
    name: "Create brewery · SaaS",
    job: "Provision tenant and first owner atomically",
    reads: "— [deployment mode gate]",
    writes: "provision_brewery [design; one RPC: brewery + owner membership]",
    spec: "Hidden in dedicated mode; this is the pre-brewery provisioning boundary.",
    hd: E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>),
    body: (<>
      {E.ttl("New brewery")}
      {E.inp("Brewery name")}
      {E.inp("Timezone")}
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
    spec: "Replaces Today until complete; app and portal shells already exist. Steps map to create_location / import_csv / create_brand / invite_staff / record_movement. The invite is drawn disabled with the same human copy as the Team frame until the invite workflow gate closes; the step can be skipped.",
    body: (<>
      {E.hd("Set up Demo Brewing", "4 steps")}
      {E.row("1 · Add locations", "inline form expanded", "in progress", "ok")}
      {E.fld("Location name", "Warehouse")}
      {E.chips(["warehouse", "taproom"])}
      {E.btn("Add location")}
      {E.row("2 · Import or add catalog", "CSV import or one brand at a time", E.act("Start"))}
      {E.row("3 · Invite the team", "email and role", E.act("Start"))}
      {E.fld("Invite email · role", "name@brewery.com · warehouse")}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.gated("Send staff invite", "isn’t available yet — invitations are being made retry-safe")}
      {E.row("4 · Opening inventory", "count what’s on hand today", E.act("Start"))}
    </>),
  },
  {
    step: 3,
    slice: 1,
    group: "Desk",
    name: "Import wizard",
    job: "Upload, map, preview and independently commit valid rows",
    reads: "list_skus · list_locations · list_customers [design]",
    writes: "import_csv [existing ID; IMPLEMENTATION-GATE: one RPC per dependent logical row + durable requestId/result]",
    states: [["all invalid", "Commit disabled · fix mapping", 1], ["mixed", "2 ready · 1 blocked"], ["rerun target", "After gate, same requestId returns result"], ["permission", "Import requires admin", 1]],
    spec: "Commit controls stay disabled until dependent rows are atomic and opening balances cannot duplicate on rerun. Ship colors: customer/catalog rows green; append-only opening balances copper.",
    body: (<>
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
    name: "Inventory · SKU detail",
    job: "See on-hand, ATP and immutable tape together",
    reads: "get_on_hand · get_atp · list_movements",
    writes: "reverse_inventory_movement [SCHEMA-GATE: auditable link + valid sign and TTB semantics]",
    spec: "Correction is not actionable yet: opposite-sign rows fail movement CHECKs; enable only after a structured reversal link and reporting semantics exist.",
    body: (<>
      {E.hd("Back · Beer", "Hazy IPA · ½ bbl")}
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
    name: "Record movement · sheet",
    job: "Enter a positive amount; server derives direction and barrels",
    reads: "list_skus · list_locations · get_atp",
    writes: "record_movement [existing; one append-only inventory movement]",
    states: [["offline", "Queue with requestId"], ["stale", "ATP changed · preview again", 1], ["permission", "Role cannot record here", 1], ["echo", "Committed row · correction waits for schema gate"]],
    spec: "The server derives sign and 0.50000000 bbl; the client never supplies either. Drawn with festival removal selected: sample and festival removal leave the premises and require dest_state (the schema CHECK); destruction, loss and depletion never carry one. Channel stays.",
    body: (<>
      {E.chips(["add finished goods", "depletion", "loss", "sample", "festival removal", "destruction", "adjustment"], 4)}
      {E.fld("SKU / package", "Hazy IPA · ½ bbl keg")}
      {E.fld("Location", "Warehouse")}
      {E.fld("Channel", "taproom")}
      {E.fld("Destination state", "PA · where the beer is poured")}
      {E.num("1", "keg · amounts are entered positive")}
      {E.info("Preview: −1 keg · 0.50 bbl · festival removal · PA")}
      {E.chips(["keg", "case", "bbl"])}
      {E.pad()}
      {E.btn("Record movement", "irr")}
    </>),
  },
  {
    step: 3,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Entity picker · drawer",
    job: "Recents first, then one registered search",
    reads: "search_entities · list_skus",
    writes: "—",
    spec: "48px rows; visible keyboard focus; one registered search behind the field.",
    body: (<>
      {E.inp("Search")}
      {E.row("Recent")}
      {E.row("Hazy IPA · ½ bbl keg", "", E.act("ATP 11"))}
      {E.row("Pils · 16 oz case", "", E.act("ATP −6"), "w")}
      {E.row("Stout · ⅙ bbl keg", "", E.act("ATP 7"))}
      {E.row("All SKUs")}
      {E.blank("All SKUs · A–Z")}
    </>),
  },
  {
    step: 4,
    slice: 1,
    tab: "Today",
    group: "Global",
    name: "Composer · propose",
    job: "Candidate language becomes canonical server preview; signed effect leads",
    reads: "preview_command [design; internal query, not an AI tool]",
    writes: "record_movement [Commit; same requestId + previewToken; server revalidates]",
    states: [["ambiguous", "One question · choice chips · no Commit button", 1], ["stale", "Reject and preview current data", 1], ["permission", "No proposal beyond allowed role", 1], ["offline", "Save candidate; no fake preview"]],
    spec: "Ambiguity (“half” = ½ bbl keg, or half the remaining ⅙?) renders a question with choice chips and no Commit; this frame is the resolved proposal after that choice. preview_command is internal, never an AI tool.",
    body: (<>
      {E.hd("Composer", "proposal")}
      {E.row("“Blew a half of Hazy at the taproom”")}
      {E.num("−1 × Hazy IPA · ½ bbl keg", "Taproom · depletion · −0.5 bbl")}
      {E.fld("SKU / package", "Hazy IPA · ½ bbl keg")}
      {E.fld("Location", "Taproom")}
      {E.fld("Type", "Depletion")}
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
    name: "Composer · answer",
    job: "Questions use named registered queries",
    reads: "get_atp · get_shortfalls [design]",
    writes: "—",
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
    writes: "— [client replays envelope’s exact registered command with same requestId; confirmed discard is local]",
    states: [["response lost", "Server dedupe returns prior result"], ["permanent", "Open form; preserve fields", 1], ["session expired", "Sign in; keep queue"], ["permission changed", "Do not replay; explain", 1]],
    spec: "The discard confirmation names every queued write; response loss resolves by requestId and shows the prior result.",
    body: (<>
      {E.row("Record movement · Hazy", "waiting for wifi", E.act("Retry"))}
      {E.row("Record fermentation reading · FV3", "response lost", E.act("Check"))}
      {E.row("Record cellar transfer · FV2", "validation failed", E.act("Fix"), "w")}
      {E.btn("Retry eligible")}
      {E.note("Discarding deletes these 3 unsent writes.")}
      {E.btn("Discard 3 queued writes", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Order · confirm",
    job: "Confirm a submitted order in two taps from Today",
    reads: "get_order · get_atp",
    writes: "confirm_order [design; one RPC: status + allocations] · cancel_order [design; one RPC: terminal status + allocation release]",
    states: [["loading", "order-shaped skeleton"], ["stale", "line changed · refresh", 1], ["permission", "sales or admin required", 1], ["cancelled", "staged quantities become restock work"]],
    spec: "2 taps from Today: Confirm → Confirm order, only when no blocking review exists. The registration warning is the same one Order · detail shows; it links to the Compliance registry and never blocks.",
    body: (<>
      {E.hd("Back · Work", "ORD-0231")}
      {E.ttl("Ridgeline Tap Room")}
      {E.row("Current state", "Submitted · ships Thu", E.act("Next: confirm"))}
      {E.row("Fulfillment source", "Warehouse", E.act("Required"))}
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
    name: "Order · detail",
    job: "The staff home for one order: state, next action, lines, events, restock",
    reads: "get_order · get_atp",
    writes: "submit_order [design; draft → submitted] · adjust_order_line [design; one RPC: line + allocation; sets needs_restock on a picked order] · confirm_order [design; one RPC] · cancel_order [design; one RPC: terminal status + allocation release]",
    states: [["draft", "Submit is the one active verb"], ["confirmed / picked", "lines adjust; restock rows appear when picked qty exceeds ordered"], ["shipped", "read-only tape · Return shipment is the correction"], ["stale", "another user changed a line · refresh", 1], ["permission", "sales or admin to adjust; warehouse reads", 1]],
    spec: "Drawn as picked after a line was adjusted down: staged 3 Pils cases must go back to Warehouse; there is no restock write — re-pick or ship clears needs_restock. Every transition appends an order_events row in the same RPC. Confirm still has its own two-tap Today frame.",
    body: (<>
      {E.hd("Back · Work", "ORD-0229")}
      {E.ttl("Al’s Bar · Columbus, OH")}
      {E.row("Current state", "Picked · restock pending", E.act("Next: ship"))}
      {E.fld("Fulfillment source · customer PO", "Warehouse · PO 4471")}
      {E.note("Put back 3 Pils cases to Warehouse — staged after the line was adjusted.")}
      {E.row("Hazy IPA · ½ bbl keg", "ordered 4 · picked 4", E.act("ATP 11"), "ok")}
      {E.row("Pils · 16 oz case", "ordered 7 · picked 10", "adjust", "w")}
      {E.row("Stout · ⅙ bbl keg", "ordered 2 · picked 2", E.act("ATP 7"), "ok")}
      {E.btns([["Adjust line", "g"], ["Add line", "g"]])}
      {E.note("Stout isn’t registered for Ohio. Check the Compliance registry ›")}
      {E.tape([["created · Ted", "Mon 9:02"], ["submitted · Ted", "Mon 9:05"], ["confirmed · Maria", "Mon 14:10"], ["picked · Dave · 4 / 10 / 2", "Tue 8:40"], ["line adjusted · Pils 10 → 7 · customer cut", "Tue 9:15"]])}
      {E.btns([["Ship order", "irr"], ["Cancel order", "irr"]])}
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
      {E.hd("Back · Pick", "ORD-0231 · short line")}
      {E.fld("Order · source", "Ridgeline · Warehouse")}
      {E.row("Pils · 16 oz case", "picked / ordered", "7 / 10", "w")}
      {E.chips(["damaged", "not found", "count error", "customer cut"], 1)}
      {E.ttl("Resolve the missing 3")}
      {E.chips(["Adjust order to 7", "Keep 3 owed · staged"], 0)}
      {E.info("Preview: order line 10 → 7 · allocation −3 · ATP −6 → −3 · customer sees “adjusted”.")}
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
      {E.hd("Back · ORD-0231", "Pick · Warehouse")}
      {E.info("From Warehouse · lines start at ordered; touch only exceptions.")}
      {E.row("Hazy IPA · ½ bbl keg", "picked / ordered", "4 / 4", "ok")}
      {E.row("Pils · 16 oz case", "", "10 / 10", "ok")}
      {E.row("Stout · ⅙ bbl keg", "", "2 / 2", "ok")}
      {E.sp()}
      {E.btn("Done picking")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Ship · invoice now",
    job: "Default wholesale ship: commit removal and the invoice together",
    reads: "get_order",
    writes: "ship_order [design; one RPC: shipment (carrier/tracking optional) + per-line qty_shipped + sale_removal movements with dest_state from ship-to + allocation fulfillment/release + shipped status + invoice with lines; invoice timing = now persisted with the shipment]",
    states: [["stale", "picked qty changed · preview again", 1], ["short ship", "qty below picked needs a reason; remainder is released", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["accepted", "INV number on commit · restock row if qty short"]],
    spec: <>Ship qty prefills from picked and is editable per line; a shortage reason appears only when qty &lt; picked. Carrier/tracking never block the commit. The preview names dest_state from the ship-to and says the invoice number is assigned on commit. On-delivery timing lives on Ship · confirmation; taproom transfers use Complete transfer.</>,
    body: (<>
      {E.hd("Back · ORD-0231", "Ship")}
      {E.row("Fulfillment source", "Warehouse", E.act("Required"))}
      {E.row("Hazy IPA · ½ bbl keg", "ship / picked", "4 / 4", "ok")}
      {E.row("Pils · 16 oz case", "ship / picked", "9 / 10", "w")}
      {E.chips(["damaged", "not found", "customer cut"], 0)}
      {E.fld("Carrier · tracking", "optional")}
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
    name: "Ship · confirmation",
    job: "On-delivery / self-delivery ship: reviewed timing must persist first",
    reads: "get_order",
    writes: "ship_order [SCHEMA-GATE: persist explicit on-delivery invoice timing on the shipment; then the same one RPC without the invoice; confirm_delivery invoices later]",
    states: [["stale", "picked qty changed · preview", 1], ["offline", "wait for live recheck", 1], ["permission", "warehouse or admin required", 1], ["schema gate", "deferred mode cannot persist yet", 1]],
    spec: "Never infer invoice timing from carrier or a future route; the reviewed choice must persist on the shipment before routing and confirm_delivery may use it. Until then this body is disabled with human copy while Ship · invoice now stays enabled.",
    body: (<>
      {E.hd("Back · ORD-0231", "Ship")}
      {E.row("Fulfillment source", "Warehouse", E.act("Required"))}
      {E.row("Hazy IPA · ½ bbl keg", "ship / picked", "4 / 4", "ok")}
      {E.row("Pils · 16 oz case", "ship / picked", "10 / 10", "ok")}
      {E.chips(["Invoice now", "On delivery"], 1)}
      {E.tape([["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"], ["−10 Pils cases · sale removal · PA", "0.47 bbl"], ["invoice number", "deferred to delivery"]])}
      {E.note("Shipping on delivery isn’t available yet — invoice timing can’t be saved. Choose Invoice now to ship today.")}
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
    spec: "No invoice-timing chip and no dest_state: beer moves between the brewery’s own locations. Copper because the paired movements are append-only. Requested from Taproom · Needs replenishment.",
    body: (<>
      {E.hd("Back · TRF-0088", "Complete transfer")}
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
    name: "Daily pick sheet",
    job: "Group confirmed demand by ship date",
    reads: "get_daily_pick_sheet [design]",
    writes: "—",
    body: (<>
      {E.hd("Back · Work", "Thu pick sheet")}
      {E.row("Ridgeline", "ORD-0231", "3 lines")}
      {E.row("Al’s Bar", "ORD-0232", "1 line")}
      {E.row("Teresa’s", "ORD-0234", "5 lines")}
      {E.nav("Totals", "Hazy halves 9 · Pils cases 22")}
      {E.sp()}
      {E.btn("Print pick sheet", "g")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Taproom · weekly count and par",
    job: "Target-state count plus active suggested transfer",
    reads: "get_taproom_count_snapshot [SCHEMA-GATE] · get_taproom_replenishment [design] · list_locations",
    writes: "record_taproom_count [SCHEMA-GATE: durable count + lines + optional movements in one RPC] · create_taproom_transfer [design; one RPC: order with explicit source + destination + lines + allocations]",
    spec: "Count is target-state only and disabled until durable count persistence lands; the taproom lead uses the warehouse permission bundle. INVERTED (this frame was drawn the other way round): the physical count is the source of truth and posts the depletion — connected or not. POS supplies expected consumption and posts nothing, so disconnecting removes the expected column and changes nothing about what the count writes. That is also why a keg moving warehouse → taproom stays on the books as taproom stock: taproom_transfer keeps channel null, and the beer leaves only when a count says it is gone, which makes a month-end count yield the month’s removal cleanly. Variance is drawn twice on purpose: inline while someone can still recount, and as a report where a pattern across weeks — one line, one shift — is the only place it becomes legible. Counts are in kegs and cases, so qty never needs fractional widening.",
    body: (<>
      {E.hd("Back · Beer", "Taproom")}
      {E.ttl("Weekly count / sales depletion")}
      {E.note("This count posts the depletion. POS sales are the expected number beside it — the gap is what the taproom lost to pours, comps, staff drinks and line cleaning.")}
      {E.row("Pils · 16 oz case", "expected 4 · counted", "4")}
      {E.row("Hazy · ½ bbl keg", "expected 3 · counted", "2", "w")}
      {E.row("Stout · ⅙ bbl keg", "expected 2 · counted", "2")}
      {E.info("Variance −1 Hazy · 0.5 bbl unaccounted. Recording posts 4 Pils + 4 Hazy + 2 Stout depletion; the variance is reported, never posted.")}
      {E.nav("Variance by brand", "four weeks · where the gap keeps showing up")}
      {E.gated("Record count")}
      {E.ttl("Needs replenishment")}
      {E.note("Below par: transfer 4 Pils + 2 Hazy.")}
      {E.fld("Transfer from", "Warehouse · selected")}
      {E.row("Transfer to", "Taproom", E.act("Fixed"))}
      {E.btn("Create transfer order")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Variance by brand",
    job: "Where the gap between poured and counted keeps showing up",
    reads: "get_taproom_variance [design; expected from POS sales, actual from counts]",
    writes: "—",
    states: [["no POS", "no expected number · the report is empty, counts still post", 1], ["one bad week", "noise · a single week is not a pattern"], ["persistent", "same brand every week · the thing worth acting on", 1], ["not in inventory", "tapped outside stock · excluded from every column"]],
    spec: "Variance is drawn twice on purpose. Inline on the count it catches a miscount while someone can still walk back to the shelf; here it answers the different question — whether the gap is noise or a pattern — which a single week can never show. Expected comes from POS sales, actual from the physical count, and the difference is reported and never posted: it is not a movement, it is the explanation for one. The named causes are what a taproom manager actually does something about — bad pours, comps, staff drinks, line cleaning, theft — so the report groups by brand first, because a brand that leaks every week points at one line or one shift. Kegs flagged not_in_inventory are excluded from both columns rather than shown as loss.",
    body: (<>
      {E.hd("Back · Beer", "Variance")}
      {E.ttl("Variance by brand")}
      {E.chips(["4 weeks", "12 weeks"], 0)}
      {E.tbl(["Brand", "Expected", "Counted", "Variance"], [["Hazy IPA", "11.5 bbl", "11.0 bbl", "−0.5"], ["Pils", "8.0 bbl", "7.9 bbl", "−0.1"], ["Stout", "3.0 bbl", "3.0 bbl", "—"]])}
      {E.row("Hazy IPA", "short 4 weeks running · 1.8 bbl total", "−4%", "w")}
      {E.info("A brand short every week points at one line or one shift. A single short week is noise.")}
      {E.note("Reported, never posted. The count already wrote the depletion; this is the explanation for it.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Beer",
    name: "Shortfall, pars and standing allocation",
    job: "Change named quantities; never invent priority",
    reads: "get_shortfalls · get_standing_allocations [design]",
    writes: "adjust_order_line [design; one RPC: line + allocation] · release_allocation · set_taproom_par · set_taproom_standing_allocation [design]",
    spec: "There is no ranking command or priority column; every change is a named quantity edit.",
    body: (<>
      {E.hd("Back · Beer", "Pils · 16 oz case")}
      {E.num("−6", "ATP · 22 on hand · 28 allocated")}
      {E.row("ORD-0231 · Ridgeline", "adjust line", "10")}
      {E.row("ORD-0234 · Teresa’s", "release allocation", "12")}
      {E.row("Taproom standing", "edit protected qty", "6")}
      {E.row("Taproom par", "edit replenishment target", "8")}
      {E.btns([["Adjust selected", "p"], ["Edit par", "g"]])}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "Work",
    name: "Return shipment · credit memo",
    job: "Return beer and correct money atomically",
    reads: "get_order",
    writes: "return_shipment [design; one RPC: return_in movements at explicit destination + credit memo + owned-fleet keg_events linked to shipment when slice 9 is enabled]",
    body: (<>
      {E.hd("Back · ORD-0231", "Beer return")}
      {E.row("Hazy IPA · ½ bbl keg", "shipped 4 · returning", "1")}
      {E.chips(["damaged", "wrong item", "unsold"])}
      {E.fld("Return to", "Warehouse · original fulfillment source")}
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
    name: "New wholesale order",
    job: "Complete customer, source, ship-to and line entry for staff",
    reads: "list_customers · list_locations · list_skus · get_atp",
    writes: "create_order [design; one RPC: draft order + all lines]",
    spec: "Source writes required from_location_id; the app never guesses “Warehouse.” Save draft lands on Order · detail, where Submit lives.",
    body: (<>
      {E.hd("Back · Work", "New order")}
      {E.fld("Customer", "Ridgeline Tap Room")}
      {E.fld("Source location", "Warehouse")}
      {E.fld("Ship-to", "Main · Phoenixville, PA")}
      {E.fld("Customer PO", "optional · 4471")}
      {E.fld("Requested ship", "Thu 9/3")}
      {E.row("Hazy IPA · ½ bbl keg", "ATP 11 at Warehouse", "4")}
      {E.row("Pils · 16 oz case", "ATP −6 at Warehouse", "10", "w")}
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
    name: "Customers and ship-tos",
    job: "Manage accounts, addresses and portal users",
    reads: "list_customers · get_customer [design]",
    writes: "create_customer · update_customer · create_ship_to · update_ship_to · invite_customer_user [IMPLEMENTATION-GATE: harden Auth + membership workflow before UI]",
    body: (<>
      {E.hd("Back · More", "Customers")}
      {E.inp("Search customers")}
      {E.nav("Ridgeline Tap Room", "retailer · PA · 2 portal users")}
      {E.nav("Al’s Bar", "retailer · OH · brewery remits", "w")}
      {E.chips(["distributor", "retailer", "brewery", "other"], 1)}
      {E.fld("License no. · terms", "PA R-55821 · net30")}
      {E.row("Price list", "", E.act("Wholesale"))}
      {E.btn("Save customer")}
      {E.nav("Ship-tos", "Main · Dock")}
      {E.btn("Add ship-to", "g")}
      {E.note("Sending an invite emails the recipient and cannot be recalled.")}
      {E.btn("Invite portal user", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QBO",
    name: "Settings · Accounting",
    job: "One page for the QuickBooks connection, and for the three things a pay link needs",
    reads: "get_qbo_connection [design; adds payments_enabled + push defaults]",
    writes: "connect_qbo · disconnect_qbo · set_qbo_push_defaults [design; admin-only]",
    states: [["healthy", "token good; company id shown"], ["expired", "reconnect before mapping or push", 1], ["payments off", "no pay link can be generated for any invoice", 1], ["ACH only", "card disabled; cheaper, and slower to arrive"], ["defaults changed", "applies to the next push, never retroactively"]],
    spec: "Square already had Settings · Point of sale; QuickBooks had nothing, and Settings · Integrations dead-ended. This is the other half. It exists mainly to make three invisible preconditions visible before a customer meets them: QuickBooks Payments must be active on the company, AllowOnlineACHPayment / AllowOnlineCreditCardPayment must ride every push, and the customer must carry an email. Any one missing and Intuit generates no InvoiceLink, so the portal Pay button either never renders or lands on the unavailable page. Payment method is a money decision, not a checkbox: card runs a percentage fee, so on a four-figure keg invoice the method the customer picks is real money — the fee is visible in the QuickBooks Payment sidebar and MGR does not model it. Push defaults live here rather than per invoice, so an invoice cannot be born unpayable by omission.",
    body: (<>
      {E.hd("Back · Settings", "Accounting")}
      {E.ttl("QuickBooks")}
      {E.row("Demo Brewing LLC", "connected · company 9341", E.act("Active"), "ok")}
      {E.fld("Token", "healthy · refreshed today")}
      {E.row("QuickBooks Payments", "active · card and bank", "", "ok")}
      {E.ttl("Push defaults")}
      {E.info("Every invoice is pushed ready to pay. Turning both off means customers cannot pay online at all.")}
      {E.row("Bank transfer (ACH)", "on · lowest fee", E.act("On"), "ok")}
      {E.row("Card", "on · percentage fee applies", E.act("On"), "ok")}
      {E.row("Customers missing an email", "2 · cannot be pushed", E.act("Review"), "w")}
      {E.btn("Disconnect QuickBooks", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    group: "QBO",
    name: "Invoices · drift from QuickBooks",
    job: "What the AR list shows when someone edits, voids or deletes an invoice over there",
    reads: "list_invoices [design; qbo_sync_token + qbo_remote_state]",
    writes: "— [MGR does not correct QuickBooks]",
    states: [["edited there", "SyncToken changed since MGR pushed", 1], ["voided", "amounts zeroed; this is not payment", 1], ["deleted", "the id points at nothing; sync gets a 404", 1], ["not sent", "pushed but never delivered — only a fault if MGR is not the channel"], ["live", "the ordinary case; no badge at all"]],
    spec: <>QuickBooks has no read-only invoice. Once pushed, the accountant can edit, void or delete it from the Sales transactions sidebar and no API setting prevents that — so MGR detects rather than prevents. QuickBooks hands us the detector free: SyncToken increments on every modification and already rides the response the sync job reads for balance, so drift costs one column and no extra call. The rule this frame protects: <b>a voided invoice is not a paid invoice.</b> Voiding zeroes the amounts, so any logic inferring paid from qbo_balance_cents = 0 books cancelled revenue as collected — the database refuses paid_at unless the remote state is live rather than trusting the job to remember. MGR surfaces drift and stops: no re-push that overwrites an accountant’s correction, no field-level merge UI. ASSUMPTION: a drifted invoice stays in AR at QuickBooks’ numbers, because QuickBooks owns the invoice after push.</>,
    body: (<>
      {E.hd("Back · More", "Invoices")}
      {E.row("INV-1042 · Ridgeline", "due 10/03 · pushed", "$1,051.52")}
      {E.row("INV-1041 · Al’s Bar", "edited in QuickBooks · $980 → $1,040", "$1,040", "w")}
      {E.row("INV-1040 · Teresa’s", "voided in QuickBooks · not paid", "$0.00", "w")}
      {E.row("INV-1039 · Ridgeline", "deleted in QuickBooks · re-push or write off", "—", "w")}
      {E.row("INV-1038 · Al’s Bar", "pushed · not sent from QuickBooks", "$540")}
      {E.row("INV-1037 · Ridgeline", "paid 8/29 from QBO", "$980", "ok")}
      {E.info("MGR shows what changed over there. Corrections belong in QuickBooks, or as a credit memo here.")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Invoices and QBO",
    job: "An AR list first; connect, map and push are the drill-in for one invoice",
    reads: "list_invoices · get_qbo_connection · get_qbo_mapping_candidates [design]",
    writes: "connect_qbo · set_qbo_customer_mapping · set_qbo_item_mapping · push_invoice_to_qbo [design]",
    states: [["connection health", "QuickBooks · token healthy · company 9341"], ["expired", "Reconnect before mapping or push", 1], ["paid", "paid_at arrives from the QBO sync · no user verb"], ["drill-in", "one invoice: mapping candidates + Push"]],
    spec: "List rows carry due / push_failed / paid_at and credit-memo QBO status; payments come back through the sync job and are read-only here. Tapping a failed row opens the drill-in drawn below the list: connection, each mapping and push are four independent commands; push is online-only copper and persists exact payload + deterministic requestId before the remote POST. Creating a credit memo stays Return shipment.",
    body: (<>
      {E.hd("Back · More", "Invoices")}
      {E.row("QuickBooks", "connected · company 9341", "healthy", "ok")}
      {E.row("INV-0198 · Ridgeline", "due 9/18 · pushed", "$1,240")}
      {E.row("INV-0197 · Al’s Bar", "push failed · item unmapped", "$540", "w")}
      {E.row("INV-0190 · Ridgeline", "paid 8/29 from QBO", "$980", "ok")}
      {E.row("CM-0012 · Teresa’s", "credit memo · pushed", "−$180")}
      {E.ttl("INV-0197 · fix and push")}
      {E.row("SKU · Pils case", "QBO candidate: Pils 16 oz", E.act("Select"))}
      {E.btn("Save item mapping")}
      {E.btn("Push invoice to QBO", "irr")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Catalog and price lists",
    job: "Define brands, SKUs, package BOMs and prices without ledger writes",
    reads: "list_brands · list_skus",
    writes: "create_brand · update_brand · create_sku · update_sku · replace_sku_bom [design; one RPC replaces selected SKU full BOM] · create_price_list · update_price_list · set_price_list_item [existing/design]",
    spec: "BOM replacement is one RPC, never a client row loop. Brand and SKU facts (ABV, tax class, package, bbl_per_unit) edit on the Brand / SKU frame; this page stays list + BOM + a simple list × SKU price item — no v1 price matrix.",
    body: (<>
      {E.hd("Back · More", "Catalog")}
      {E.nav("Hazy IPA", "IPA · 6.8% · 3 SKUs")}
      {E.nav("Pils", "Lager · 4.9% · 2 SKUs")}
      {E.nav("Stout", "Stout · 7.2% · 1 SKU")}
      {E.fld("Package BOM · Hazy case", "24 cans + 24 ends + 24 labels + tray")}
      {E.btn("Replace selected SKU BOM")}
      {E.fld("Wholesale · Hazy ½ bbl", "$150.00")}
      {E.btn("Save price item")}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Product / SKU",
    job: "Sellable facts without ledger writes, including the TTB fields",
    reads: "list_brands · list_skus",
    writes: "create_brand* · update_brand · create_sku* · update_sku",
    states: [["new brand", "name + style + ABV + tax class"], ["inactive SKU", "hidden from portal; history keeps it"], ["keg SKU", "keg size chip; container source waits for slice 5"]],
    spec: "bbl_per_unit is the basis of all TTB math, so it shows as the exact fraction and the decimal the ledger will freeze. ttb_tax_class defaults to beer; other classes appear when the brewery sells one. No UPC scan, no container_source editor here.",
    body: (<>
      {E.hd("Back · Catalog", "Hazy IPA")}
      {E.fld("Brand name", "Hazy IPA")}
      {E.fld("Style · ABV", "IPA · 6.8 %")}
      {E.chips(["beer"], 0)}
      {E.btn("Save brand")}
      {E.ttl("SKU · ½ bbl keg")}
      {E.fld("SKU name", "½ bbl keg")}
      {E.chips(["keg", "can", "bottle"], 0)}
      {E.fld("Units per case", "— · kegs are single units")}
      {E.fld("bbl per unit", "1/2 · 0.50000000")}
      {E.btns([["Add SKU", "g"], ["Save SKU", "p"]])}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    name: "Portal · Order",
    job: "A buyer catalog: price, package, quantity, Place order",
    reads: "get_portal_catalog [SCHEMA/RLS-GATE: return customer-allowed fulfillment source]",
    writes: "submit_order [SCHEMA/RLS-GATE: validate allowed from_location_id; one RPC: order + lines + submitted status]",
    states: [["empty catalog", "call brewery; nothing orderable"], ["missing price", "item cannot enter cart", 1], ["no ship-to", "contact brewery; choose an existing ship-to", 1], ["repeat recheck", "SKU, price, ship-to and source revalidate", 1], ["receipt", "ORD number after commit"]],
    spec: "Target 2 taps: Same as last week → Place order (the repeat proposal opens Review prefilled). Review stays disabled until the schema/RLS contract supplies and validates a customer-allowed source — never silently choose Warehouse. Stepper − and + each ship as 48×48 targets. No staff vocabulary (ATP, gates, fulfillment engineering) anywhere in the portal. No persistent cart: leaving the page keeps nothing.",
    body: (<>
      {E.hd("Order", "Ridgeline")}
      {E.btn("Same as last week", "g")}
      {E.row("Hazy IPA · ½ bbl keg", "$150.00", E.stq(4))}
      {E.row("Pils · 16 oz case", "$38.00", E.stq(6))}
      {E.row("Stout · ⅙ bbl keg", "$62.00", E.stq(0))}
      {E.row("Ships from", "Warehouse")}
      {E.row("Ship-to · requested date", "Main · Wed 9/9", E.act("Change"))}
      {E.sp()}
      {E.btn("Review order · $828.00", "p disabled")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Order",
    surface: "sheet",
    name: "Portal · Review",
    job: "Confirm quantities, ship-to and fulfillment line, then place the order",
    reads: "get_portal_catalog [SCHEMA/RLS-GATE: return customer-allowed fulfillment source]",
    writes: "submit_order [SCHEMA/RLS-GATE: validate allowed from_location_id; one RPC: order + lines + submitted status]",
    states: [["price changed", "revalidated price shown before Place order", 1], ["inactive SKU", "line removed · told plainly", 1], ["submit error", "keep quantities · Retry safe", 1], ["duplicate", "same request returns the same ORD number"]],
    spec: "The confirm step for both the stepper path and Same as last week. Buyer copy only: price, package, quantity, “Ships from Warehouse”, Place order. No ATP, no gate names. Place order stays disabled until the source contract exists. After submit the portal is read-only — changes go through the brewery.",
    body: (<>
      {E.row("Hazy IPA · ½ bbl keg", "4 × $150.00", "$600.00")}
      {E.row("Pils · 16 oz case", "6 × $38.00", "$228.00")}
      {E.fld("Ship-to", "Main · Phoenixville, PA")}
      {E.fld("Requested date", "Wed 9/9")}
      {E.row("Ships from", "Warehouse")}
      {E.fld("Your PO number", "optional")}
      {E.info("Order number is assigned when you place the order.")}
      {E.sp()}
      {E.btn("Place order · $828.00", "p disabled")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Orders",
    name: "Portal · Orders",
    job: "See status and adjusted quantities without staff controls",
    reads: "list_portal_orders [design]",
    writes: "—",
    states: [["expanded row", "lines with ordered vs shipped and plain adjusted copy"], ["no orders", "Start one from Order"]],
    spec: "Each row expands in place into its lines; adjusted quantities are stated in buyer copy. No change-request, no cancel — the portal is read-only after submit; the row says whom to call.",
    body: (<>
      {E.hd("Orders", "Ridgeline")}
      {E.row("ORD-0231", "confirmed · ships Thu", "$1,240")}
      {E.row("ORD-0225", "shipped 8/27", "$980")}
      {E.row("ORD-0221", "adjusted · 2 cases short", "$528", "w")}
      {E.row("Hazy IPA · ½ bbl keg", "ordered 2 · shipped 2", "$300.00")}
      {E.row("Pils · 16 oz case", "ordered 8 · shipped 6 · 2 not available", "$228.00", "w")}
      {E.info("Need a change? Call Demo Brewing — orders can’t be edited here after they’re placed.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Portal · Invoice · Pay",
    job: "One stable MGR link that resolves to QuickBooks at the moment it is clicked",
    reads: "get_portal_invoice · get_qbo_connection [design; payments_enabled flag]",
    writes: "— [Intuit takes the payment; paid_at returns through the sync job]",
    states: [["payable", "Pay opens QuickBooks in a new tab"], ["no payments account", "the button never renders; brewery has no QuickBooks Payments", 1], ["not pushed yet", "no qbo_invoice_id; Pay is absent, not disabled"], ["link unavailable", "Intuit returned none — the unavailable page, never a 500", 1], ["already paid", "Pay is gone; paid_at came back from the sync"]],
    spec: "The whole design is one rule: MGR owns the link, Intuit owns the destination. What is shared — this row, the emailed reminder, the PDF footer — is always /portal/invoices/:id/pay, an MGR URL that is permanent because it resolves late. Intuit’s InvoiceLink is read-only, is generated only for a pay-enabled invoice with a customer email, has no documented expiry, and is intermittently absent; fetching it seconds before the redirect makes every one of those someone else’s problem. It is never stored in a column, never serialised to the client, never put in an email. It is a bearer URL — anyone holding it can pay — so authorization runs on every click before any Intuit call is made, and the 404 for a customer requesting somebody else’s invoice must land before the fetch, not after.",
    body: (<>
      {E.hd("Back · Invoices", "INV-0198")}
      {E.ttl("$1,240.00")}
      {E.row("Due", "9/18/2026")}
      {E.row("Status", "Sent · unpaid", "", "w")}
      {E.tbl(["Item", "Qty", "Amount"], [["Hazy IPA · 1/2 bbl", "4", "740.00"], ["Pils · 16 oz case", "6", "252.00"]])}
      {E.info("Pay by card or bank transfer through QuickBooks. You will not need an account.")}
      {E.btn("Pay invoice")}
      {E.note("Opens QuickBooks in a new tab. This link keeps working — it is re-checked each time you open it.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Portal · Payment unavailable",
    job: "The degraded page that replaces a 500 when Intuit returns no link",
    reads: "get_portal_invoice [design]",
    writes: "—",
    states: [["no link", "Intuit generated none for this invoice", 1], ["no customer email", "the cause push should have caught first", 1], ["payments off", "brewery has no QuickBooks Payments account"], ["reason logged", "the customer sees one page; the brewery sees why"]],
    spec: "Exists so that “works every time” is honest rather than aspirational. Every precondition is checked before the share — push refuses an invoice whose customer has no email, and the Payments capability is cached on the connection — but InvoiceLink can still come back empty, so the click path needs a designed floor. The customer gets one coherent page with the invoice still readable and a way to reach a human; MGR logs the distinguishing reason. Never a stack trace, never a dead redirect, never a Pay button that throws.",
    body: (<>
      {E.hd("Back · Invoices", "INV-0198")}
      {E.ttl("$1,240.00")}
      {E.info("Online payment isn’t available for this invoice right now.")}
      {E.row("Due", "9/18/2026")}
      {E.tbl(["Item", "Qty", "Amount"], [["Hazy IPA · 1/2 bbl", "4", "740.00"], ["Pils · 16 oz case", "6", "252.00"]])}
      {E.note("Contact Demo Brewing to arrange payment — the invoice above is unchanged and still due.")}
      {E.row("Demo Brewing", "(610) 555-0142", "›")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Invoices",
    name: "Portal · Invoices",
    job: "See issued, due and paid invoices",
    reads: "list_portal_invoices [design]",
    writes: "—",
    body: (<>
      {E.hd("Invoices", "Ridgeline")}
      {E.row("INV-0198", "due 9/18", "$1,240", "w")}
      {E.row("INV-0190", "paid 8/29", "$980", "ok")}
      {E.blank("No invoices yet. They appear after shipment or delivery.")}
    </>),
  },
  {
    step: 6,
    slice: 1,
    portal: "Account",
    name: "Portal · Account",
    job: "Read own ship-to, signed-in membership and deposit details",
    reads: "get_portal_account [design]",
    writes: "—",
    spec: "Peer portal users are not listed; the composer exposes only account-safe reads and order commands.",
    body: (<>
      {E.hd("Account", "Ridgeline")}
      {E.nav("Main ship-to", "Phoenixville, PA")}
      {E.nav("Dock ship-to", "Royersford, PA")}
      {E.row("You · buyer", "signed-in membership", "active")}
      {E.row("Keg deposits held", "38 × ½ bbl", "$1,140")}
      {E.info("Contact the brewery to change account details.")}
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
    spec: "Complete batch stays disabled until close/reconciliation identity exists: batches.closed_at, the occupancy close and typed automatic reconciliation must commit atomically. Tile fill derives from occupancy vs vessel capacity — never a status column.",
    body: (<>
      {E.hd("Back · Beer", "Cellar")}
      {E.tiles([["FV1", "Pils · 12.8 / 15 bbl", "1.9 °P · read 4 h", 0, 85], ["FV2", "Hazy · 9.0 / 15 bbl", "7.5 °P · read 8 h", 0, 60], ["FV3", "Stout · 13.5 / 15 bbl", "5.2 °P · overdue 31 h", 1, 90], ["BT1", "Pils · 7.0 / 10 bbl", "carbing", 0, 70], ["BT2", "Empty · 0 / 10 bbl", "available", 0, 0], ["FB1", "Saison · 0.4 / 1 bbl", "aging · read 1 d", 0, 40]])}
      {E.btns(["Reading", "Transfer", "Brew day"], "c3")}
      {E.fld("Selected vessel", "FV3 · 15 bbl · fermenter")}
      {E.btns([["Add vessel", "g"], ["Save vessel", "g"]])}
      {E.gated("Complete batch")}
      {E.sp()}
    </>),
  },
  {
    step: 7,
    slice: 4,
    group: "Global",
    surface: "sheet",
    name: "Fermentation reading · sheet",
    job: "Record any values taken; SG converts to stored Plato",
    reads: "get_cellar_map [design; occupancy + last reading]",
    writes: "record_fermentation_reading [design; mutable reading row]",
    spec: "One reading may contain gravity, temperature, pH, or any combination. Blank values remain absent; prior values are reference only, never silently copied.",
    body: (<>
      {E.fld("Gravity", "1.019 SG · prior 1.021")}
      {E.fld("Temperature", "68.2 °F · prior 67.8")}
      {E.fld("pH", "blank · prior 4.21")}
      {E.chips(["SG", "°P"], 0)}
      {E.info("Enter only values taken now; blanks are not rewritten.")}
      {E.inp("Note · optional")}
      {E.pad()}
      {E.btn("Record reading")}
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
      {E.fld("Occupancy", "FV2 · B-0416 · Hazy IPA")}
      {E.fld("Material", "Citra · hop")}
      {E.chips(["dry hop", "fermentation", "other"], 0)}
      {E.num("18", "lb · lot L-0790 · 262 on hand")}
      {E.chips(["lb", "oz", "kg"])}
      {E.info("Preview: −18 lb Citra · L-0790 · consumption · dry hop · B-0416")}
      {E.pad()}
      {E.btn("Record addition", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 4,
    tab: "Work",
    name: "Brew day",
    job: "Schedule first; later consume actual lots and set knockout baseline",
    reads: "get_brew_day [design]",
    writes: "schedule_batch [design; single planned-batch row] · record_brew_day [design; one RPC: additions + material movements + occupancy]",
    spec: "Two modes: planned (recipe · date · planned bbl) and brew day (actual lots · knockout vessel). Save schedule is green and independent; Record brew day posts immutable material consumption for mash/boil/whirlpool stages only — the 18 lb Citra dry hop is posted later from Cellar addition. Yeast is consumed as a material lot, not a culture generation (plan §8).",
    body: (<>
      {E.hd("Back · Work", "B-0416 · Hazy")}
      {E.fld("Recipe / date", "Hazy IPA v4 · 9/4 · 15 bbl")}
      {E.btn("Save schedule")}
      {E.row("2-row", "lot L-0821", "660 lb")}
      {E.row("Citra · boil", "lot L-0790", "6 lb")}
      {E.row("Yeast", "WLP066 · lot Y-0312", "1 brink")}
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
    name: "Cellar transfer · loss",
    job: "Write one transfer row with its own loss_bbl",
    reads: "get_cellar_map [design; occupancy volumes]",
    writes: "record_cellar_transfer [design; one RPC: create target occupancy(initial_bbl=0) when empty + append transfer(loss_bbl) + close source occupancy iff fully emptied]",
    spec: "Drawn as a blend into an occupied brite: BT1 keeps its occupancy and B-0412 keeps its identity — the schema has one batch per occupancy and blends are transfers into the surviving one (renaming a blend as a new batch is a plan §8 schema gap). An empty target (BT2) gets an initial_bbl=0 occupancy in the same RPC; the transfer row stays immutable; a fully emptied source closes its occupancy. A partial transfer never implies loss: the person explicitly holds the remainder or records loss. No vessel status.",
    body: (<>
      {E.fld("From", "FV1 · Pils · B-0409 · 12.8 bbl")}
      {E.fld("To", "BT1 · Pils · B-0412 · 7.0 / 10 bbl")}
      {E.num("3.0", "bbl moving")}
      {E.info("Blend preview: BT1 7.0 + 3.0 = 10.0 bbl (full) · stays B-0412 · Pils. FV1 keeps 9.8 bbl.")}
      {E.fld("Remainder in FV1", "9.8 bbl")}
      {E.chips(["Leave in FV1", "Record as loss"], 0)}
      {E.tape([["3.0 bbl FV1 → BT1 · blend", "loss 0.0 bbl"]])}
      {E.pad()}
      {E.btn("Record transfer", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Work",
    name: "Packaging run · close",
    job: "Plan a run separately, then create lot and movements on close",
    reads: "get_packaging_run [design; revalidate selected source occupancy] · list_locations",
    writes: "schedule_packaging_run [design; one RPC: run with explicit source occupancy + planned outputs] · close_packaging_run [design; one RPC: revalidate source + close + lot + outputs + material movements at explicit locations]",
    spec: "One frame, two modes: plan (green; date, source occupancy, planned outputs) and close (copper review; revalidated source, actual outputs, lot, explicit FG destination, material consumption/return/damage, yield/loss). Print labels is presentation after commit — measured thermal keg-collar/lot labels per plan §3. No packaging-day-actuals screen.",
    body: (<>
      {E.hd("Back · Work", "RUN-0031 · Hazy cans")}
      {E.fld("Packaging source", "FV3 · occupancy/B-0416")}
      {E.fld("Plan", "Hazy · cans · Fri 9/5")}
      {E.fld("Planned outputs", "118 cases")}
      {E.btn("Save run plan")}
      {E.tbl(["need", "have", "short"], [["cans 2,880", "3,100", "—"], ["ends 2,880", "2,400", <><span className="text-warning-foreground">480</span></>], ["labels 2,880", "5,000", "—"]])}
      {E.note("480 ends short · resolve or explicitly override before starting.")}
      {E.fld("Packaged", "118 cases")}
      {E.fld("Lot", "L-240905-HZ")}
      {E.fld("Finished goods destination", "Warehouse · selected")}
      {E.tape([["FV3 · occupancy/B-0416", "source revalidated"], ["+118 cases · production in", "Warehouse · new lot"], ["−2,832 cans + ends · consumption", "FIFO"], ["Labels returned / damaged", "24 / 6"], ["Beer loss · 0.30 bbl", "yield 97.9%"]])}
      {E.btns([["Print labels · lot / keg collar", "g"], ["Close packaging run", "irr"]])}
    </>),
  },
  {
    step: 7,
    slice: 5,
    tab: "Beer",
    group: "Global",
    name: "Lot trace · recall",
    job: "Trace a lot globally from material to customer",
    reads: "trace_lot [design]",
    writes: "—",
    body: (<>
      {E.hd("Back · Search", "L-240831-HZ")}
      {E.row("Hazy IPA · 16 oz case", "RUN-0028 · packaged 8/31", "118")}
      {E.tape([["−40 · ORD-0225 · Ridgeline", "8/27"], ["−24 · ORD-0229 · Teresa’s", "8/29"], ["−6 · taproom transfer", "8/30"], ["−2 · sample", "8/30"]])}
      {E.nav("Materials in", "2-row L-0821 · Citra L-0790")}
      {E.btn("Print trace", "g")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "Work",
    name: "Receive purchase order",
    job: "Count what arrived; trigger derives receipt status",
    reads: "get_purchase_order [design]",
    writes: "send_purchase_order [design; single row draft → sent] · receive_purchase_order [design; one RPC: receipt + lines (counted, over or short) + lots with best_by + material movements]",
    states: [["loading", "PO-line skeleton"], ["stale", "receipt changed · recheck", 1], ["offline", "keep counts; commit waits"], ["permission", "warehouse or admin", 1], ["success", "partially received"]],
    spec: "Send PO (send_purchase_order, green) shows while the PO is draft; receiving needs a sent PO. Only counted quantity posts; over and short are both visible and both allowed — the keypad never clamps an over-count as the only guard. PO status is trigger-derived — never write a loaded/status flag.",
    body: (<>
      {E.hd("Back · Work", "PO-0142 · Country Malt")}
      {E.row("Status", "sent Mon · expected Thu", E.act("Send PO"))}
      {E.row("2-row · 55 lb bags", "expected 40 · counted", "42", "w")}
      {E.row("Citra · 44 lb boxes", "expected 4 · counted", "3", "w")}
      {E.row("Rice hulls · 50 lb", "expected 6 · counted", "6", "ok")}
      {E.fld("Citra lot · best by", "2026-CIT-77 · 2027-08-31")}
      {E.tape([["+2,310 lb 2-row · receipt", "over 2 bags"], ["+132 lb Citra · receipt", "lot 2026-CIT-77 · short 1"]])}
      {E.info("2-row is over by 2 bags and Citra short 1; the PO becomes partially received.")}
      {E.sp()}
      {E.btn("Receive purchase order", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    group: "Global",
    surface: "sheet",
    name: "Material cycle count",
    job: "Post only variance as an append-only movement",
    reads: "get_material_on_hand [design]",
    writes: "record_material_count [design; one RPC: count + lines + adjustment movements]",
    body: (<>
      {E.fld("Material", "Cans · 16 oz")}
      {E.num("3,050", "system 3,100 · variance −50 each")}
      {E.chips(["each", "case"])}
      {E.pad()}
      {E.btn("Record count", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 2,
    tab: "More",
    name: "Vendors, contracts and draft PO",
    job: "Manage materials, suppliers, contracts and a manual purchase draft",
    reads: "list_materials · get_material_on_hand · list_vendors_and_contracts [design]",
    writes: "create_material · update_material · upsert_vendor · upsert_material_contract · create_purchase_order [design; draft PO + lines uses one RPC]",
    spec: "Draft only here; Send PO lives on the PO/receive frame — no send wizard.",
    body: (<>
      {E.hd("Back · More", "Materials + vendors")}
      {E.fld("Material", "Citra · hop · lb")}
      {E.btns([["Add material", "g"], ["Save material", "g"]])}
      {E.row("Citra 2026 · YCH", "committed 400 lb", "262 received")}
      {E.row("2-row 2026 · Country Malt", "committed 20,000 lb", "8,800 received")}
      {E.fld("Vendor lead time", "10 days")}
      {E.btn("Save vendor")}
      {E.fld("Contract quantity", "400 lb")}
      {E.btn("Save contract")}
      {E.btn("Create draft purchase order", "g")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Recipe version",
    job: "Author immutable versions from assumptions; actuals keep predictions honest",
    reads: "list_recipes · get_recipe [design] · get_recipe_outcomes [design; per-batch actual OG/FG/ABV + realized efficiency/attenuation, derived from fermentation readings — never stored]",
    writes: "create_recipe [design; mutable parent row] · create_recipe_version [design; one RPC: immutable version + ingredients; SCHEMA-GATE: assumption columns on recipe_versions + per-ingredient extract snapshot + extract potential on materials; typed target_og/fg/abv columns drop]",
    spec: "Predictions come from one shared registry-layer formula over the version’s snapshotted inputs (assumptions + per-ingredient extract); the editor’s live preview and server reads call the same function; values are never stored — no SQL copy. Versioning is disabled behind its schema gate. A new parent takes name and style only; versions append — history is never edited. Costing lives on desk.",
    body: (<>
      {E.hd("Back · More", "Hazy IPA v4")}
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
      {E.note("Actuals run −0.4 °P OG vs predicted (eff 68–71% vs 72% assumed) — lower the assumption on v5?")}
      {E.gated("Create recipe version")}
    </>),
  },
  {
    step: 7,
    slice: 6,
    tab: "More",
    name: "Compliance · month",
    job: "Generate from ledgers, review, then record the external filing",
    reads: "generate_compliance_report · get_loss_review [design; SCHEMA-GATE for typed completion-loss identity]",
    writes: "file_compliance_report [design; immutable snapshot] · reattribute_loss [SCHEMA-GATE; requires typed origin/classification + atomic compensation]",
    spec: "Reattribution waits for schema that identifies completion rows and cellar removal class; correction must be atomic append-only compensation — never free-text note matching. The identity checks are v1 lessons drawn in user copy: balance per class, cellar as in-process, 0.00 never blank, no transmission.",
    body: (<>
      {E.hd("Back · More", "August 2026")}
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
    spec: "Unregistered destination/brand combinations warn during order confirm and link here.",
    body: (<>
      {E.hd("Back · Compliance", "Registry")}
      {E.chips(["brands", "states", "licenses"])}
      {E.row("Hazy IPA", "COLA approved · formula n/a", E.act("PA · OH"))}
      {E.row("Stout", "COLA pending", E.act("PA"), "w")}
      {E.row("Ohio", "supplier registered · expires 12/31", "we remit")}
      {E.btn("Save registration")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    name: "POS setup, mapping and reconcile",
    job: "Sync idempotently, map reversibly, then post explicit depletion",
    reads: "get_pos_setup [design]",
    writes: "connect_square · sync_square_sales [design; one security-invoker batch RPC per fetched page, deduped by unique external line ID] · set_pos_location_mapping · set_pos_item_mapping · reconcile_pos_sales [design; one RPC: selected depletion movements + sale links]",
    states: [["disconnected", "Connect Square starts external OAuth", 1], ["invalid mapping", "Reconcile disabled until brand/format and qty_per_sale validate", 1], ["unmapped location", "its sales hold · nothing reconciles from it", 1], ["location added in Square", "found on the next sync · appears unmapped", 1], ["mapped late", "held sales reconcile at their own dates", 1], ["closed in Square", "mapping and history kept · nothing new arrives", 1]],
    spec: "Locations are never typed: ListLocations returns them at connect and they land in pos_locations, so the left of each row is Square’s truth and only the right is a choice. Both choices open the shared entity picker rather than a mapping page of their own — three rows do not earn a screen, and lifting them out would hide the gate from the reconcile that is blocked by it. MGR holds one Square location to one MGR location: a second claim on the same MGR location is refused, or two registers would deplete one shelf without either knowing. ListLocations runs on every sync, not only at connect: a location opened next year has to surface on its own, or its sales disappear with nothing on screen to explain it. It appears unmapped rather than defaulting to anything. Its held sales are the reason the row counts them — raw rows never delete, so mapping makes a backlog reconcilable rather than forgiving it, and each depletion posts at its own sale date. Posting a month of pours on the mapping date would balance the ledger and falsify every variance report built on it. Nothing else is asked for: once mapped, availability derives from that location’s stock and prices inherit their format defaults, so the menu fills itself. A location closed in Square keeps its mapping and its history and simply stops producing sales. External fetch/retry reuses requestId; raw sale rows never delete; no durable cursor is claimed. Reconcile posts immutable rows only after both mapping fields validate. A former SCHEMA-GATE is closed here: sale_channel is no longer a four-value enum pinned to Taproom but per-brewery rows in sale_channels, so on-premise and off-premise report separately without a movement-model change. Each depletion carries a sale_channel_id resolved as coalesce(item override, location channel) — never inferred, and never the old Taproom literal, so two Square locations can post under different channels. Refund lines are in the same list and the same RPC/requestId: a refund previews as a positive adjustment (inventory credit) — sales-only reconcile is how v1 lost units. INVERTED (was drawn the other way round): the physical count is the source of truth and posts the depletion; POS sales post nothing and supply expected consumption. The gap between them is the product — bad pours, theft, staff drinks, comps, line cleaning — and it exists only because both halves are kept. Reconcile therefore records the expected figure and the sale links, never a movement.",
    body: (<>
      {E.hd("Back · Settings", "Square")}
      {E.btn("Connect Square", "irr")}
      {E.btn("Sync Square sales", "irr")}
      {E.info("Locations come from Square. Choose what each one feeds and which channel its sales post under.")}
      {E.nav("Square Taproom", "MGR Taproom · channel Taproom", "ok")}
      {E.nav("Square Warehouse", "MGR Warehouse · channel DTC", "ok")}
      {E.nav("Square Events", "new · 42 held sales since Aug 12", "w")}
      {E.btn("Save location mapping")}
      {E.row("“Hazy 16 oz draft”", "exact SKU/package", E.act("Hazy IPA · ½ bbl keg"))}
      {E.fld("Qty per sale", "1/124 keg per 16 oz")}
      {E.fld("Channel override", "none · inherits Taproom")}
      {E.btn("Save item mapping")}
      {E.row("7 sales · Hazy 16 oz", "depletion", "−0.0282 bbl")}
      {E.row("1 refund · Hazy 16 oz", "inventory credit · adjustment", "+0.0040 bbl", "w")}
      {E.note("The weekly count posts the depletion. These sales are the expected number the count is measured against.")}
      {E.btn("Reconcile 7 sales + 1 refund", "irr")}
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
    spec: "Return empty posts the deposit refund in the same RPC — there is no deposit-only screen. Beer coming back with the keg is Return shipment (beer + deposit). No dirty/clean CIP status.",
    body: (<>
      {E.hd("Back · Beer", "Keg fleet")}
      {E.fld("Selected pool", "Owned ½ bbl · 203 kegs · $30 deposit")}
      {E.btns([["Add keg pool", "g"], ["Save keg pool", "g"]])}
      {E.row("Owned ½ bbl", "142 out · 61 in", "203")}
      {E.row("Ridgeline", "38 out", "$1,140")}
      {E.row("Unreturned over 90 days", "", "9", "w")}
      {E.chips(["acquire", "return empty", "lost / found", "retire"], 1)}
      {E.fld("Customer · qty", "Ridgeline · 4 × ½ bbl")}
      {E.info("Preview: +4 returned · Ridgeline 38 → 34 out · credit memo −$120.00 deposit refund")}
      {E.note("Empty kegs only; beer return/credit is Return shipment.")}
      {E.btn("Record keg return · refund $120", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    name: "Tap board",
    job: "What is on, since when, and roughly how much is left",
    reads: "list_open_taps [design; Realtime on this page only, 30s poll is an adequate fallback]",
    writes: "tap_keg · swap_keg [design; closes A and opens B in one RPC] · kick_keg [design; compare-and-swap on the open interval id]",
    states: [["swap", "one act, one record · never kick-then-tap"], ["already swapped", "second attempt fails · Helles was already swapped out at 7:42pm", 1], ["not in taproom stock", "put on by a person · never discovered from Square", 1], ["guest or event keg", "yield from nominal size · excluded from variance", 1], ["two kegs, one brand", "taps 2 and 9 · sales split proportionally, yield labelled split", 1], ["no number", "sorts last · a number is never required"], ["duplicate number", "shown as entered · nothing downstream reads it"], ["kicked", "interval closed with a reason · the tap goes empty"], ["packaged short", "enters stock open · filled volume is measured, not guessed", 1], ["open, off tap", "still open stock · counted by volume, not as a whole keg", 1]],
    spec: <>REDRAWN against the decided schema (16.13), which chose differently from the first drawing: the primitive is the <b>swap</b>, not tap-then-blow. A bartender changing a keg performs one act, and a kick-then-tap model asks for two records — the gap between them is where data goes missing, worst exactly when it matters, on a follow keg of the same beer where nothing looks wrong afterwards. swap_keg closes A and opens B in one RPC, the same discipline as the keg-return RPC, so an interval can never be left open by a half-finished swap. That is also why lines were the wrong model: the ambiguity was never about where a keg is plugged in. Numbers here are the brewery’s own, optional and sparse — 1, 3, 5 with nothing at 2 or 4 — they sort this board and nothing else reads them, so MGR neither generates nor enforces them and two kegs numbered alike is a thing to look at, not a save error. Unnumbered kegs sort last. A keg that is not ours reaches this board one way only — somebody tapped it here. Nothing arrives from Square: an item the taproom created there is <i>ignored</i> under 16.14, never queued and never mapped, so the guest cider in the register and the guest cider on this line are two unrelated facts that happen to share a name. It is recorded because the board is what the website reads, and a board that silently omits a pouring tap lies to customers, and because the keg still earns a yield from its nominal size. Nothing here touches the ledger: the count posts depletion (16.15), which is what makes two writers safe and why a keg tapped outside taproom stock needs no special rule — it is flagged not_in_inventory, still earns a yield from its nominal size, and is excluded from variance. A keg packaged short enters stock <b>open</b> rather than as sealed inventory, which is the decision that makes it obvious it should be used next and, more quietly, keeps a weekly count honest — counted as one keg it would overstate the shelf, counted by its volume it does not. That also means open_fill for such a keg is <i>known</i>, measured at the packaging run and already in the ledger as that run’s output, rather than the eyeball the spec assumes; a yield derived from it is measured, not estimated. Remaining percent is estimated from POS sales against nominal volume, and it is the reason this screen is worth opening: a board that only takes data from people gets ignored. Two kegs of one brand open at once splits sales proportionally and any per-keg yield is labelled <i>split</i>, never presented as measured. The duplicate-swap risk is uncertainty, not simultaneity — the command carries the open interval id and requires closed_at null, so the second attempt fails with copy a human can act on rather than opening a phantom interval; the recent list below is the correction path, not a guard.</>,
    body: (<>
      {E.hd("Back · Beer", "Tap board")}
      {E.ttl("On tap")}
      {E.chips(["Taproom", "Warehouse"], 0)}
      {E.tiles([["1", "Pils · ½ bbl", "on Mon", 0, 71], ["2", "Hazy IPA · ½ bbl", "on Mon", 0, 62], ["3", "Stout · ⅙ bbl", "on Tue · filled 60%", 0, 34], ["4", "Amber · ½ bbl", "on Sat", 0, 88], ["5", "Helles · ½ bbl", "on Wed · nearly out", 1, 9], ["6", "Saison · ½ bbl", "on Thu", 0, 54], ["8", "Porter · ⅙ bbl", "on Fri", 0, 46], ["9", "Hazy IPA · ½ bbl", "on Thu · second keg", 1, 93], ["10", "Kolsch · ½ bbl", "on Tue", 0, 27], ["11", "Barrel Dark · ⅙ bbl", "on Sun", 0, 80], ["—", "Wild Ale · ⅙ bbl", "on Thu · no number", 0, 66]])}
      {E.row("7 · Guest cider · keg", "tapped here by Dana · not our stock, no depletion", E.act("Kick"), "w")}
      {E.ttl("Open, not on a tap")}
      {E.row("Amber · ½ bbl", "packaged short · filled 60% · 0.30 bbl", E.act("Tap"), "w")}
      {E.row("Stout · ⅙ bbl", "pulled off tap 9 Sun · ~40% left", E.act("Tap"), "w")}
      {E.info("A keg that was never filled to nominal enters stock open, not sealed. It counts as beer, not as a keg, and it is meant to be used next.")}
      {E.info("Ten taps numbered 1–11 with no 7 — numbers are yours, sparse is normal, and MGR neither generates nor renumbers them. Unnumbered kegs sort last.")}
      {E.btns(["Swap keg", "Kicked"])}
      {E.row("Recent · Kolsch tapped", "Dana · Tue 4:10pm")}
      {E.row("Recent · Saison swapped in", "Ali · Thu 11:20am")}
      {E.note("Remaining is estimated from POS sales against nominal volume. Nothing on this board posts to the ledger — the weekly count does that.")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "Beer",
    surface: "sheet",
    name: "Swap keg · sheet",
    job: "Close one keg and open the next in a single record",
    reads: "list_open_taps · get_taproom_sellable [design]",
    writes: "swap_keg [design; closes A and opens B in one RPC, carries the open interval id and requires closed_at null] · kick_keg [design]",
    states: [["same brand", "the follow keg is the default · one tap, not two records"], ["guest keg", "name and nominal size are typed · nothing comes from Square", 1], ["already swapped", "Helles was swapped out at 7:42pm by Ali · nothing opens", 1], ["no number", "left blank · the keg sorts last on the board"], ["close fill", "three chips · never a typed number", 1], ["kicked instead", "closes with a reason · the tap goes empty"]],
    spec: <>The surface every other tap decision assumed and none of them showed. One sheet, because the swap is one act: what comes off and what goes on are decided together and written by one RPC, so an interval can never be left open by a half-finished swap. Going on defaults to the same brand, which is the common case — a follow keg of the flagship — and is exactly the case a kick-then-tap model loses, because afterwards nothing looks wrong. Coming off asks for a rough remaining, never a number: yield is poured ÷ (nominal × (open_fill − close_fill)), and the honest input is three chips rather than a text field implying precision nobody has. Empty is the default because it is nearly always true. <b>Not our stock</b> is the toggle that answers where a guest keg comes from: nothing is discovered from Square, where such an item is <i>ignored</i> under 16.14 and never maps. A person puts it on and types it, which is why name and nominal size become inputs here — there is no brand to read them from, and yield needs the size. SCHEMA-GATE: 16.13 says a not_in_inventory interval earns a yield from its nominal size but never says what identifies the beer when no brand exists behind it; the interval needs its own label and size columns. The tap number is typed and optional, here as everywhere — MGR has no concept of a physical line, so this field is the only place a number can enter the system. The conflict row is the compare-and-swap guard made visible: the command carries the open interval id and requires closed_at null, so the realistic failure — the website posted a swap, the bartender did not see it land and swaps again a minute later — fails with copy naming the beer, who and when instead of opening a phantom interval.</>,
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
      {E.info("Remaining is a rough call, not a measurement — it only feeds the yield report and never the ledger.")}
      {E.btn("Swap · one record", "irr")}
      {E.btn("Kicked · leave the tap empty", "g")}
      {E.note("One RPC closes the old interval and opens the new one. A half-finished swap is not a state this can reach.")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Route and loading",
    job: "Build route, inspect derived load and finish route timestamps",
    reads: "get_route_load · get_route_builder [design; require persisted shipment invoice timing]",
    writes: "save_route [design; one RPC: route + stop assignments] · depart_route · return_route [design]",
    states: [["post-route", "All stops complete · returned_at empty"]],
    spec: "Load derives only from shipments with a persisted invoice mode; the checklist is presentation only — no loaded status or mark-loaded command. Unassigned shipments become stops with driver, vehicle and stop order in the same save_route RPC. A refused delivery has no screen: leave the stop open and assign it to a later route. Resume opens the next incomplete stop for the assigned driver.",
    body: (<>
      {E.hd("Back · Work", "Route A · Thu")}
      {E.fld("Driver · vehicle", "Maria · Box truck 2")}
      {E.row("Stop 1 · Ridgeline", "4 Hazy halves · 6 Pils cases", "next")}
      {E.row("Stop 2 · Al’s Bar", "2 Stout sixths", "after")}
      {E.row("Stop 3 · Teresa’s", "8 Hazy halves · 12 Pils cases", "after", "w")}
      {E.row("Unassigned · ORD-0236 · Dock", "3 Hazy halves · shipped, no route", E.act("Add stop"), "w")}
      {E.btns([["Save route plan", "g"], ["Depart route", "p"]])}
      {E.btn("Return route")}
    </>),
  },
  {
    step: 7,
    slice: 10,
    tab: "Work",
    name: "Driver · confirm delivery",
    job: "Name receiving contact, then commit delivery and invoice",
    reads: "get_delivery_stop [design; require persisted on-delivery invoice timing]",
    writes: "confirm_delivery [design; one RPC: delivered_at + signed_by + invoice only when persisted mode is on-delivery; never ships]",
    states: [["offline", "keep stop open; commit waits", 1], ["response lost", "same requestId returns result"], ["permission", "warehouse membership + route.driver_user_id = current user, or admin", 1], ["success", "INV number after commit"]],
    spec: "2 taps: receiving-contact chip → Delivered. signed_by is stored text; the UI never implies a signature image is retained.",
    body: (<>
      {E.hd("Route A", "Stop 1 of 3")}
      {E.ttl("Ridgeline Tap Room")}
      {E.row("Invoice timing", "On delivery · persisted", E.act("Required"))}
      {E.row("Hazy IPA · ½ bbl keg", "", "4")}
      {E.row("Pils · 16 oz case", "", "6")}
      {E.chips(["Maria", "Dave", "Type name"], -1)}
      {E.sp()}
      {E.btn("Delivered", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 8,
    group: "Desk",
    name: "Planning · desk",
    job: "See demand gaps and draft a PO without priority state",
    reads: "get_planning_shortfalls [design]",
    writes: "draft_purchase_order_from_requirements [design; one RPC: draft PO + lines]",
    body: (<>
      {E.tbl(["week", "demand", "supply", "gap"], [["9/7", "48 bbl", "40 bbl", <><span className="text-warning-foreground">−8</span></>], ["9/14", "52 bbl", "60 bbl", "+8"]])}
      {<><div>[object Object][object Object][object Object]</div></>}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat settings · disconnected",
    job: "Explain the projection before an admin installs a provider",
    reads: "get_chat_integration_health [design]",
    writes: "begin_chat_installation [design; admin-only, single-use OAuth intent]",
    states: [["permission", "admin only", 1], ["OAuth cancelled", "remain disconnected · try again", 1]],
    spec: "This is production Settings UI, not a developer demo. Preview surfaces remain available while disconnected and use non-sensitive fixtures.",
    body: (<>
      {E.hd("Back · Settings", "Chat")}
      {E.ttl("Chat notifications")}
      {E.info("Bring today’s assigned, due and overdue work into chat. MGR remains the source of truth.")}
      {E.row("Slack", "Not connected", E.act("Connect"))}
      {E.nav("Preview surfaces", "App Home · personal DM · team digest")}
      {E.btn("Connect Slack")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat settings · active + previews",
    job: "Operate one brewery/provider installation and inspect every outbound surface",
    reads: "get_chat_integration_health · get_notification_preferences · get_brewery_operating_defaults [design] · chat_preview_fixtures [presentation]",
    writes: "set_notification_destination · set_brewery_quiet_hours · set_brewery_operating_defaults · disable_chat_installation · disconnect_chat_installation [design]",
    states: [["healthy", "last callback and delivery shown"], ["retrying", "queue count + redacted reason", 1], ["disabled", "no sends; previews still work", 1]],
    spec: "Preview picker renders the same provider-neutral fixtures consumed by renderer contract tests. It never queries live customer data or sends a message. Reading cadence is MGR-owned and controls both Today and chat.",
    body: (<>
      {E.hd("Back · Settings", "Chat")}
      {E.row("Slack · Demo Brewing", "Connected · scopes healthy", E.act("Active"), "ok")}
      {E.fld("Operations channel", "#mgr-operations · private")}
      {E.fld("Quiet hours", "9:00 PM–6:00 AM · brewery time")}
      {E.fld("Reading overdue after", "24 hours · Today + chat")}
      {E.chips(["App Home", "Personal DM", "Team digest", "Preferences"], 0)}
      {E.row("Preview · App Home", "4 current work reasons · fixture data", E.act("Open"))}
      {E.btn("Disable", "g")}
      {E.btn("Disconnect Slack", "irr")}
    </>),
  },
  {
    step: 8,
    slice: "chat",
    tab: "More",
    group: "Chat",
    name: "Chat health · reauthorization required",
    job: "Fail closed while keeping recovery understandable and personal delivery isolated",
    reads: "get_chat_integration_health [design]",
    writes: "begin_chat_reauthorization · disable_chat_installation · disconnect_chat_installation [design]",
    states: [["token revoked", "all provider sends stop", 1], ["channel externalized", "team digest stops; eligible personal sends continue", 1], ["uninstalled", "links and queued actions invalidated", 1]],
    spec: "Provider errors remain redacted. Emergency disable does not depend on Slack being reachable.",
    body: (<>
      {E.hd("Back · Chat", "Health")}
      {E.note("Slack authorization expired. No messages are being sent.")}
      {E.row("Last callback", "Today · 8:42 AM", E.act("Succeeded"))}
      {E.row("Last delivery", "Today · 8:43 AM", E.act("Succeeded"))}
      {E.row("Queued", "3 deliveries", E.act("Paused"), "w")}
      {E.btn("Reauthorize Slack")}
      {E.btn("Disable integration", "irr")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    name: "Settings · Point of sale",
    job: "Connect one POS provider and see both directions at a glance",
    reads: "get_pos_integration_health [design; provider-neutral]",
    writes: "begin_pos_installation · disable_pos_installation · disconnect_pos_installation [design; admin-only]",
    states: [["no provider", "connect one before a menu can publish"], ["healthy", "catalog and sales both current"], ["sales lagging", "the menu still publishes", 1], ["token revoked", "publishing and sync both stop", 1], ["connector detected", "Square already posts taproom revenue to QuickBooks", 1], ["second location", "its own MGR location and its own channel", 1], ["unmapped location", "its sales cannot reconcile until it is mapped", 1]],
    spec: "Provider-neutral by construction, mirroring the chat integration that already solved this: portable contracts, one adapter per provider, and a conformance test every adapter must pass (see lib/chat/contracts.ts and chat-adapter-conformance.test.ts). Square is the only adapter today and the only value this screen can offer; nothing in the copy, the commands or the schema names it. integration_tokens already carries provider in (qbo, square), so the seam exists below this screen. DISCOVERED from a live Square library: a taproom may already run Square’s own QuickBooks connector, which posts taproom sales into QuickBooks as Sales receipts without MGR. That is a different revenue stream from the wholesale invoices MGR pushes, so today it does not double-count — but only by luck, and a brewery running both without knowing is the failure mode. This screen detects it and says so rather than letting the accountant find two sources of taproom revenue at month end.",
    body: (<>
      {E.hd("Back · Settings", "Point of sale")}
      {E.ttl("Point of sale")}
      {E.info("Publish what the taproom can sell, and read its sales back. One provider is connected at a time.")}
      {E.row("Square · Demo Brewing LLC", "catalog published · sales syncing", E.act("Active"), "ok")}
      {E.row("Square → QuickBooks connector", "detected · Square posts taproom sales to QBO itself", E.act("Review"), "w")}
      {E.row("Taproom", "MGR Taproom · channel Taproom", "5 published")}
      {E.row("Warehouse", "MGR Warehouse · channel DTC", "3 published")}
      {E.gated("Third location", "not mapped · sales would have nowhere to deplete")}
      {E.fld("Last sales sync", "Today · 6:58 PM")}
      {E.nav("Menu", "one catalog · Square, the website, per-location price")}
      {E.btn("Disable", "g")}
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
    states: [["derived", "every row is a brand, a format and stock on hand"], ["override", "one row priced away from its format default", 1], ["no price anywhere", "no format default and no override — that row cannot publish", 1], ["out of stock", "row retires itself; price and provider id are kept"], ["provider rejected", "the row keeps its edit; nothing half-published", 1], ["second location", "same catalog, scoped · its own price and stock", 1], ["present at one only", "the other location never sees the row", 1], ["one destination", "a row can publish to Square and not the website", 1], ["website beer unmapped", "adopted by matching it to a brand once", 1]],
    spec: <>REDRAWN: this was an authoring surface and is now a read-out. Brand, format and availability are all derived — brand from what is in the bin, formats from the brand, availability from taproom stock — so publishing is zero-touch and a new brand reaches the register the moment stock lands. Retail resolves as coalesce(override, format.default_retail_cents), which is why the table shows the inherited number and names its Source: an exception has to be legible, or a stale price from last summer becomes silently authoritative. The override column stays null unless someone sets it, so a format-wide price change actually propagates — writing the default into every row on publish would freeze each one at its first price, which is the failure mode this drawing exists to prevent. Publish changes survives because MGR still owns when the provider copy is refreshed. Location is a scope rather than a column: Square publishes one item with per-location presence on the variation, so MGR maintains one catalog and varies where each row appears — two parallel menus would fight that model and double every retire. Everything under the switcher is read for one location: stock, availability, and the price override that is keyed by pos_location. A column would only serve a cross-location comparison nobody performs, while every action here is taken against one register. RENAMED from POS menu: the register is no longer the only destination. The website is the third consumer of this catalog after Square and QuickBooks, not an integration of its own — a bespoke web feed would produce a third answer to what are we selling right now, and would leak unannounced beer, which is the same ownership boundary the Square item library taught. So the website is a read client keeping no copy, and the sync logic it runs today exists only because it keeps one. Its existing beers are adopted exactly as pre-integration Square items are: matched to a brand once, then maintained from here, so nothing vanishes from a public page the day MGR connects. Transport is deliberately not drawn — a menu changes a handful of times a day, so a cached read of the published rows is as fresh as a socket per visitor without opening an anonymous realtime path. Destination-native rows sit <i>below</i> that button rather than in the table: position is what says they are outside the publishable set, which no label reliably does. They appear at all because an unmapped taproom item is the reason a sale fails to reconcile, and Map is the only action MGR ever offers against a row it does not own.</>,
    body: (<>
      {E.hd("Back · More", "Menu")}
      {E.ttl("POS menu")}
      {E.chips(["Taproom", "Warehouse"], 0)}
      {E.info("One catalog, scoped to a location. Price and availability are read for the location above.")}
      {E.tbl(["Brand · format", "Retail", "Source", "Publishes to"], [["Hazy IPA · pint", "$7.00", "format", "Square · Website"], ["Hazy IPA · crowler", "$9.00", "format", "Square"], ["Pils · pint", "$6.50", "override", "Square · Website"], ["Pils · crowler", "$12.00", "format", "Square"]])}
      {E.row("Stout · pint", "no taproom stock · off the register", E.act("Retired"), "w")}
      {E.note("Pils · pint is the only override — $6.50 against a format default of $7.00. Every other row follows its format.")}
      {E.btn("Publish changes")}
      {E.ttl("Also on these destinations")}
      {E.info("Created in Square or on the website, not by MGR. MGR never renames, prices or retires these — it maps them so their sales reconcile.")}
      {E.row("Guest cider · pint", "not mapped · its sales cannot reconcile", E.act("Map"), "w")}
      {E.row("Pretzel", "not mapped · no MGR stock behind it", "—")}
    </>),
  },
  {
    step: 7,
    slice: 7,
    tab: "More",
    group: "POS",
    surface: "sheet",
    name: "POS item",
    job: "Override one price — everything else is inherited from the format",
    reads: "get_pos_menu_item [design]",
    writes: "set_pos_price_override [design; nullable override keyed by pos_location] · clear_pos_price_override [design]",
    states: [["inherited", "no override · the format price is what publishes"], ["overridden", "this row is priced away from the default", 1], ["reset", "override cleared · the row rejoins the format price"], ["no price at all", "no format default and no override · Save stays disabled", 1], ["per location", "a second taproom overrides the same row separately", 1], ["format changed", "conversion and premise follow the format, not this sheet"], ["tax preserved", "publishing never clears the provider’s tax assignment", 1]],
    spec: "REDRAWN against the brand/format schema: Serving and Premise are no longer authored here. A format owns its conversion (a pint is 1/124 of a ½ bbl) and its premise, so this sheet reads them instead of asking again — the same fact stored twice is exactly the coupling the channel change had to unwind. What is left is the one thing inventory cannot answer: a price exception. Nullable and keyed by pos_location, so an empty override lets a format-wide change propagate and the Warehouse can price the same brand differently from the Taproom without either row copying a number. Availability stays a rule, not a per-keg switch: MGR retires the row when taproom stock runs out and re-publishes under the same provider id when it returns. Price still lands on the variation rather than the item, so an override writes to the format’s variation id.",
    body: (<>
      {E.fld("Brand", "Hazy IPA")}
      {E.fld("Format", "pint · poured")}
      {E.fld("Pours from", "½ bbl keg · Taproom")}
      {E.fld("Serving", "1/124 of a ½ bbl · 0.004032 · from the format")}
      {E.fld("Premise", "On-premise · from the format")}
      {E.fld("Tax", "On-premise rate · held by the provider")}
      {E.fld("Format price", "$7.00")}
      {E.inp("Price override · $6.50")}
      {E.btn("Reset to format price", "g")}
      {E.row("Sell while taproom stock remains", "retires itself when it runs out", E.act("On"))}
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
    name: "Sale channels and tax treatment",
    job: "Name the channels this brewery sells through and what each one is taxed as",
    reads: "list_sale_channels [design; §16.3 + PR #42]",
    writes: "create_sale_channel · update_sale_channel · delete_sale_channel [SCHEMA-GATE: revision 2 §16.3 — sale_channels replaces the sale_channel enum]",
    states: [["in use", "delete refused by on delete restrict · human copy, not a 23503", 1], ["seeded", "four defaults arrive with the brewery"], ["inherit", "a customer with no override takes the channel default"]],
    spec: "The channel carries a name and a default tax treatment and nothing else: removal classification stays on movement_type, which is why #42 rejected is_removal and requires_dest_state. Resolution order is customer override → channel default, and the resolved value is frozen onto the movement at write time so editing a customer in March never restates January.",
    body: (<>
      {E.hd("Back · Settings", "Sale channels")}
      {E.nav("Wholesale", "taxable · 118 movements")}
      {E.nav("Taproom", "taxable · 402 movements")}
      {E.nav("DTC", "taxable · 34 movements")}
      {E.nav("Export", "export · 6 movements")}
      {E.fld("Channel name", "Export")}
      {E.chips(["taxable", "export", "vessel supplies", "research", "transfer in bond"], 1)}
      {E.info("Customers may override this. A taproom depletion has no customer and takes the channel default.")}
      {E.note("A channel with movements cannot be deleted.")}
      {E.gated("Save channel", "isn’t available yet — channels are still a fixed list")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Formats and composition",
    job: "Type bbl_per_unit once, on the atomic format, and derive every shape above it",
    reads: "list_formats [design; §16.2] · get_format_components [design; §16.2a]",
    writes: "create_format · update_format · replace_format_components [design; one RPC replaces the child set] · replace_format_bom [SCHEMA-GATE: revision 2 §16.2/16.2a/16.12 — formats, format_components and format_bom supersede skus.bbl_per_unit and sku_bom]",
    states: [["atomic", "carries a typed bbl_per_unit"], ["children missing", "a composed format cannot be created before its children", 1], ["poured", "never holds stock · a ratio back to the keg"], ["in use", "editing a format never moves frozen movement bbl"]],
    spec: "bbl_per_unit is the basis of all TTB math, so exactly one row types it. Only atomic formats carry a volume; composed ones compute it from format_components, which is also what makes repack (§16.10) validated rather than asserted. basis says only whether the shape holds stock — a pour is a component row with a fractional qty, not a different kind of thing. Each BOM line's on_break disposition is what the repack sheet reads. OPEN (§16.16 q1): fully sized formats, drawn here, or shape-only.",
    body: (<>
      {E.hd("Back · Settings", "Formats")}
      {E.tbl(["Format", "Basis", "bbl / unit", "From"], [["16 oz can", "packaged", "0.00403226", "typed"], ["four-pack", "packaged", "0.01612903", "4 × can"], ["case · 24×16oz", "packaged", "0.09677419", "6 × four-pack"], ["½ bbl keg", "packaged", "0.50000000", "typed"], ["pint", "poured", "0.00403226", "1/124 × ½ bbl"]])}
      {E.fld("Format name", "case · 24×16oz")}
      {E.chips(["packaged", "poured"], 0)}
      {E.fld("Volume", "0.09677419 bbl · derived · read-only")}
      {E.ttl("Composition")}
      {E.row("four-pack", "qty 6", E.act("Remove"))}
      {E.row("+ add component", "child format · qty", "")}
      {E.ttl("Packaging BOM")}
      {E.tbl(["Material", "Qty", "On break"], [["Case tray", "1", "return to stock"], ["PakTech", "0", "consumed"]])}
      {E.info("One level only: a case breaks into four-packs, never straight into cans.")}
      {E.gated("Save format", "isn’t available yet — package facts still live on each SKU")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Price tiers by channel",
    job: "Price a format once per tier and override only the exceptions",
    reads: "list_price_lists [design; + channel_id §16.4] · get_price_list [design; formats and SKU overrides]",
    writes: "create_price_list · update_price_list · set_price_list_format · set_price_list_item · clear_price_list_item [SCHEMA-GATE: revision 2 §16.4 — price_lists.channel_id and price_list_formats]",
    states: [["inherited", "the format price is what the customer sees"], ["overridden", "one brand × format priced away from the tier", 1], ["poured", "a pour is priceable here and is not a SKU"], ["no price", "neither a format default nor an override · the line cannot be sold", 1]],
    spec: "price_lists are already tiers and customers.price_list_id already assigns them; revision 2 adds the channel and makes a format priceable, so a taproom pour — which is not a SKU — can be priced at all. Drawn format-default with a per-SKU override, matching Menu and POS item, which already read “format default” and offer Reset to format price. §16.16 q2 leaves the direction open; drawing it the other way would make those two shipped frames inconsistent.",
    body: (<>
      {E.hd("Back · Catalog", "Wholesale tier")}
      {E.fld("Tier name", "Wholesale · standard")}
      {E.fld("Channel", "Wholesale")}
      {E.ttl("Format defaults")}
      {E.tbl(["Format", "Price", "Source"], [["½ bbl keg", "$185.00", "tier default"], ["sixtel", "$95.00", "tier default"], ["case · 24×16oz", "$38.00", "tier default"]])}
      {E.ttl("Brand × format overrides")}
      {E.row("Barrel-aged Stout · ½ bbl keg", "$240.00 · against a $185.00 default", E.act("Reset"), "w")}
      {E.row("+ add override", "brand · format · price", "")}
      {E.info("All halves are $185, except the barrel-aged one. Clear an override and the row rejoins the tier.")}
      {E.gated("Save tier", "isn’t available yet — a tier still prices one package at a time")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    tab: "More",
    name: "Location bins",
    job: "Subdivide a location without making every query carry an or-null",
    reads: "list_locations · list_bins [design; §16.6]",
    writes: "create_bin · update_bin · delete_bin [SCHEMA-GATE: revision 2 §16.6 — bins, inventory_movements.bin_id not null, taproom_pars re-keyed on bin]",
    states: [["default bin", "created with the location · cannot be deleted", 1], ["in use", "a bin holding stock cannot be deleted", 1], ["par on a bin", "keep 4 cases in the to-go fridge"]],
    spec: "Every location gets a default bin created with it, so bin_id is NOT NULL everywhere it appears — movements, pars, menus — and no on-hand or availability query carries a nullable branch. One setup artifact bought against a whole class of null handling. Bins are physical subdivisions a menu can read; they are explicitly not tap lines (§16.8), which are hand-maintained state nothing downstream validates.",
    body: (<>
      {E.hd("Back · Settings", "Taproom · bins")}
      {E.gated("Taproom", "the default bin · created with the location and cannot be removed")}
      {E.nav("Walk-in", "38 cases · 12 kegs")}
      {E.nav("To-go fridge", "22 cases · par 4 cases")}
      {E.row("+ add bin", "name · kind", "")}
      {E.fld("Bin name", "To-go fridge")}
      {E.fld("Par", "4 cases · Hazy IPA")}
      {E.info("A brewery that never subdivides sees one bin and ignores it.")}
      {E.note("Tap lines are not bins — the tap board owns those.")}
      {E.gated("Save bin", "isn’t available yet — a location is still one undivided space")}
    </>),
  },
  {
    step: 8,
    slice: 1,
    group: "Global",
    surface: "sheet",
    name: "Repack · sheet",
    job: "Break bulk as a paired, bbl-conserving pair of legs — never a loss and a gain",
    reads: "get_format_components [design; §16.2a] · get_material_on_hand",
    writes: "record_repack [SCHEMA-GATE: revision 2 §16.10 — repack movement type, shared ref, abs(sum(bbl)) < 0.000001 over the ref]",
    states: [["offered", "composition knows a case yields six four-packs · nobody types both halves"], ["breakage", "−1 case · +5 four-packs · +1 loss keeps the invariant absolute", 1], ["materials", "case tray returns to stock, PakTech is consumed · per-repack override"]],
    spec: "adjustment cannot express a break: it has no way to pair the two halves, so the break reads as an unexplained loss beside an unexplained gain. The outbound leg's bbl is derived from the inbound leg's frozen total rather than recomputed from bbl_per_unit — rounding each leg independently leaves −0.00000001 on a 24×16oz case — and the constraint carries a tolerance to catch a hand-entered repack without rejecting a legitimate one. Build-direction repack is out of scope; the whole repack is one RPC sharing one ref so beer and materials cannot disagree.",
    body: (<>
      {E.fld("Break", "Hazy IPA · case · 24×16oz")}
      {E.fld("Location · bin", "Warehouse · Walk-in")}
      {E.num("1", "case · amounts are entered positive")}
      {E.pad()}
      {E.tape([["−1 case · repack", "0.09677419 bbl"], ["+6 four-pack · repack", "derived from the case total"], ["Case tray ×1", "return to stock"], ["PakTech ×6", "consumed"]])}
      {E.info("Preview: conserves 0.09677419 bbl · same location and bin · not a TTB removal")}
      {E.fld("Damaged on break", "0 four-pack · records as loss")}
      {E.gated("Record repack", "isn’t available yet — breaking a case has nowhere correct to land")}
    </>),
  },
];
