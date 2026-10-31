// tests/mgr-screens.test.ts — the screen inventory (the source of truth for
// MGR screens) is a typed record set:
// every record carries its metadata, `states` is a caption (never rendered
// into the body), and each shared body renders without throwing.
// Rendering uses react-dom/server, so no DOM is needed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { INV, SCREENS, type Screen } from "../components/mgr/screens";
import { E, splitPinned } from "../components/mgr/e";
import { VenueFrame } from "../components/mgr/venue";
import { AppShell } from "../components/mgr/app-shell";
import { ScreenFrame } from "../components/mgr/screen-frame";
import { DatePicker } from "../components/mgr/date-picker";
import { VolumeField } from "../components/mgr/volume-field";
import { BatchesView } from "../components/mgr/views/batches";
import { BrewDayView } from "../components/mgr/views/brew-day";
import { batchesFromQuery, toBatchesViewProps } from "../lib/mgr/batches-view";
import type { BrewDayViewModel } from "../lib/mgr/brew-day-view";
import { WeeklyCountView } from "../components/mgr/views/weekly-count";
import { weeklyCount } from "../lib/mgr/fixtures/taproom";

/** One screen's body as static markup, by name. Rendered once and kept: the
 *  suite asks for the same handful of screens across a dozen assertions. */
const rendered = new Map<string, string>();
const body = (name: string) => {
  let html = rendered.get(name);
  if (html === undefined) {
    html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    rendered.set(name, html);
  }
  return html;
};

/** The same body as plain text, tags stripped — what a reader would see.
 *  Goes through the `body` memo, so a screen asserted twice renders once. */
const text = (name: string) => body(name).replace(/<[^>]*>/g, " ");

describe("SCREENS", () => {

  it("gives brew day its pinned sheet and explicit actual confirmation", () => {
    const brew = text("Brew day");
    expect(brew).toMatch(/Pinned recipe plan/);
    expect(brew).toMatch(/Confirm actual ingredients/);
    expect(brew).toMatch(/Confirmed process observations/);
    expect(brew).not.toMatch(/Actual mash|Mash actual/i);
    expect(String(SCREENS.find((s) => s.name === "Brew day")!.writes)).toContain("record_brew_day");
  });

  it("names the Settings water entry after the Water profiles catalog", () => {
    const settings = text("Settings");
    expect(settings).toMatch(/Water profiles/);
    expect(settings).not.toMatch(/Source water/);
    expect(SCREENS.find((s) => s.name === "Water profiles empty")!.job).not.toMatch(/source and target/i);
    expect(SCREENS.find((s) => s.name === "Settings")!.to?.["Water profiles"]).toBe("Water profiles");
  });

  it("makes a recipe version executable without restating the batch size", () => {
    const recipe = text("Recipe");
    expect(recipe).toContain("Pre-boil volume");
    expect(recipe).toContain("Boil time");
    expect(recipe).toContain("Whirlpool rest");
    expect(recipe).toContain("Knockout temp");
    expect(recipe).toContain("Version note");
    expect(recipe).toContain("Ingredients");
    expect(recipe).toContain("Process");
    expect(recipe).toContain("Mash schedule · 3 steps");
    expect(recipe).toContain("Fermentation schedule · 4 stages");
    expect(recipe).toMatch(/Water\s+Target /);
    // Spec D4: one place holds the mash temperature, and it is the schedule.
    expect(recipe).not.toMatch(/Mash temp/);
    // Spec D3: quantities are per barrel; the batch names its size on Brew day.
    expect(recipe).not.toMatch(/Batch size|Knockout volume/);
    // The process-spec columns landed (#278 slice 5): no gate on the record.
    const gate = String(SCREENS.find((s) => s.name === "Recipe")!.writes);
    expect(gate).not.toMatch(/SCHEMA-GATE/);
    expect(gate).toMatch(/schedules/);
  });

  it("draws the Recipe frame from the shared schedule helpers, with its saved date and no gate", () => {
    const recipe = SCREENS.find((s) => s.name === "Recipe")!;
    const drawn = text("Recipe");
    // The water row is titled Water, as on the live draft; the Water frame names the source.
    expect(drawn).not.toContain("Water · Municipal Denver");
    expect(drawn).toContain("Target Hazy target · 3 additions");
    expect(recipe.to?.Water).toBe("Water");
    expect(text("Water")).toContain("Municipal · Denver");
    expect(drawn).toContain("Total 85 min · 152 °F saccharification rest");
    expect(drawn).toContain("Saved");
    expect(drawn).toContain("Aug 28, 2026");
    const spec = String(recipe.spec);
    expect(spec).not.toMatch(/schema gate/i);
    expect(spec).toContain("each batch's Brew day keeps the plan it was brewed from");
    const states = (recipe.states ?? []).map(([name]) => name);
    expect(states).toEqual(expect.arrayContaining(["no version", "draft", "frozen"]));
    expect(states).not.toContain("no price group");
  });

  it("keeps water profiles in the catalog, with their ion values", () => {
    const list = text("Water profiles");
    expect(list).toContain("Burton");
    expect(list).toContain("Sulfate 610");
    const catalogText = text("Catalog");
    expect(catalogText).toContain("Water profiles");
  });

  it("gives water one stage axis and a source picked from Water profiles", () => {
    const water = text("Water");
    expect(water).toContain("Gypsum");
    expect(water).toContain("Municipal · Denver");
    expect(water).not.toMatch(/brewery default/);
    expect(water).toContain("Target mash pH");
    // Spec D7: one stage axis. The addition sheet asks where a salt goes once,
    // never a timing and a target that can contradict each other.
    const sheet = text("Water addition");
    expect(sheet).toContain("Stage");
    expect(sheet).not.toMatch(/\bTiming\b|\bTarget\b/);
  });

  it("draws a mash schedule with its steps, total and conversion rest", () => {
    const mash = text("Mash schedule");
    expect(mash).toContain("Saccharification");
    expect(mash).toContain("152 °F");
    expect(mash).toContain("Total 85 min");
    expect(mash).toContain("The 152 °F rest is recorded as the mash temperature.");
    expect(mash).not.toMatch(/gravity prediction/);
    expect(mash).toContain("Add step");
  });

  it("draws a fermentation schedule that places the dry hop", () => {
    const ferm = text("Fermentation schedule");
    expect(ferm).toContain("Diacetyl rest");
    expect(ferm).toContain("Total 18 days");
    expect(ferm).toMatch(/dry hop day 4 falls in Primary/);
    expect(ferm).toContain("Add stage");
  });

  it("lets a SKU carry an optional UPC; price is never a SKU exception", () => {
    const sku = SCREENS.find((s) => s.name === "SKU")!;
    expect(sku.spec).not.toMatch(/UPC\/provider mappings/);
    expect(sku.spec).not.toMatch(/price exception/);
    expect(String(sku.writes)).not.toMatch(/SCHEMA-GATE: revision 2 §16\.2/);
    expect(text("SKU")).toMatch(/UPC/);
    expect(body("SKU")).toContain(INV.upc);
  });

  it("lets a recipe parent suggest a price group without pricing a version", () => {
    const recipe = SCREENS.find((s) => s.name === "Recipe")!;
    expect(text("Recipe")).toContain("Default price group");
    expect(text("Recipe")).toMatch(/pre-fill/i);
    expect(String(recipe.writes)).not.toMatch(/price/i);
  });

  it("gives a price group a position and a cost ceiling, and no prices of its own", () => {
    const group = SCREENS.find((s) => s.name === "Price group")!;
    const drawn = text("Price group");
    expect(drawn).toContain("Position");
    expect(drawn).toContain("Cost ceiling");
    expect(drawn).toMatch(/suggest/i);
    // An empty ceiling or barcode is a finished state, not unfinished setup, so
    // it reads "none" and earns no states entry (spec D4). The group owns a UPC
    // per packaged format (price_group_barcodes).
    expect(drawn).toContain("none");
    expect(drawn).toContain("UPC · case · 24×16oz");
    expect((group.states ?? []).map(([name]) => name)).not.toContain("no barcode");
  });

  // "Tier" is claimed vocabulary three times over — a distributor's product
  // type, v1's COGS band, and this app's own pricing — so the concept is a
  // price group wherever a person reads it. The rule spans every copy surface,
  // not just SCREENS: it first went stale in the API reference, where the
  // retired phrase had wrapped across a line and a line-oriented sweep could
  // not see it. Hence the file sweep below, whitespace-normalized. Since the
  // price grid (spec 2026-09-07-mgr-pricing-grid-naming) the retired wording is
  // gone from the wire too, so nothing is exempted from the sweep.
  it("names the pricing surfaces price groups, never tiers", () => {
    const names = SCREENS.map((s) => s.name);
    expect(names).toContain("Price groups");
    expect(names).toContain("Price group");
    expect(names).not.toContain("Price lists");
    expect(names).not.toContain("Price tiers");
  });

  it("keeps the retired pricing words out of every copy surface", () => {
    // Every surface a person reads. "price list"/"price tier" is retired
    // everywhere; the bare word "tier" is judged only where all the text is
    // user copy, because lib/ uses it correctly for resolver precedence.
    const copyOnly = [
      "components/mgr/screens.tsx", "content/docs/staff-guide.mdx",
      ...readdirSync(resolve(__dirname, "../content/docs/api")).filter((f) => f.endsWith(".mdx")).map((f) => `content/docs/api/${f}`),
      "app/(app)/pricing/page.tsx", "app/(app)/customers/page.tsx",
      "app/(app)/customers/[id]/page.tsx", "app/(app)/customers/customer-form.tsx",
      "app/(app)/pricing/price-cell-form.tsx", "app/(app)/pricing/group-form.tsx",
      "app/(app)/catalog/brands/[id]/brand-page.tsx", "app/(app)/invoices/[id]/credit-memo-form.tsx",
      "app/(app)/settings/channels/page.tsx",
      "components/mgr/views/delete-channel.tsx",
    ];
    const alsoCode = [...copyOnly, "lib/mgr/nav.ts", "lib/mgr/screen-links.ts",
      "lib/commands/customers.ts", "lib/commands/portal.ts", "lib/commands/catalog.ts"];
    const prose = (file: string) =>
      readFileSync(resolve(__dirname, "..", file), "utf8").replace(/\s+/g, " ");
    for (const file of alsoCode) {
      expect(prose(file), `${file}: retired pricing word`).not.toMatch(/price (list|tier)/i);
    }
    for (const file of copyOnly) {
      expect(prose(file), `${file}: retired word "tier"`).not.toMatch(/\btiers?\b/i);
    }
  });

  it("gives Search and Entity picker a labeled command input and grouped results", () => {
    for (const name of ["Search", "Entity picker"]) {
      expect(body(name)).toContain('cmdk-input=""');
      expect(body(name)).toContain('role="combobox"');
      expect(body(name)).toContain('cmdk-list=""');
      expect(body(name)).toContain('cmdk-group-heading=""');
    }
  });

  it("keeps picker selection a return action and availability readable", () => {
    expect(body("Entity picker").match(/data-to="←"/g)).toHaveLength(3);
    expect(body("Entity picker")).toContain("6 short");
    expect(body("Entity picker")).toContain("Recent");
    expect(body("Entity picker")).toContain("All SKUs");
  });

  it("ports the step-1 frames with names, jobs and IO", () => {
    const step1 = SCREENS.filter((s) => s.step === 1);
    expect(step1.map((s) => s.name)).toEqual([
      "Today", "Sales", "Brewer", "Driver", "Taproom",
      "Beer", "Work", "More", "Search", "Me", "Settings", "Permission denied",
    ]);
    for (const s of SCREENS) {
      expect(s.job).toBeTruthy();
      expect(s.reads).toBeTruthy();
      expect(s.writes).toBeTruthy();
      expect(Boolean(s.tab) || Boolean(s.group) || Boolean(s.portal) || Boolean(s.venue)).toBe(true);
    }
  });

  it("renders every body, and keeps states out of the markup", () => {
    for (const s of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, s.hd, s.body));
      expect(html.length).toBeGreaterThan(50);
    }
    const screen: Screen = { ...SCREENS[0], states: [["Caption only", "Not part of the screen body"]] };
    const frame = renderToStaticMarkup(createElement(ScreenFrame, { screen }));
    expect(frame).not.toContain("Caption only");
    expect(frame).not.toContain("Not part of the screen body");
  });

  it("keeps inventory screen names unique", () => {
    expect(new Set(SCREENS.map((s) => s.name)).size).toBe(SCREENS.length);
  });

  it("draws connection recovery and confirmation surfaces", () => {
    const expected = new Map<string, Screen["surface"]>([
      ["Map to QuickBooks", "sheet"], ["Disconnect QuickBooks", "sheet"],
      ["Square locations", "sheet"], ["Disconnect Square", "sheet"],
      ["Link your Slack", "entry"], ["Disconnect Slack", "sheet"],
    ]);
    for (const [name, surface] of expected) {
      const screen = SCREENS.find((s) => s.name === name);
      expect.soft(screen, name).toBeTruthy();
      expect.soft(screen?.surface, name).toBe(surface);
    }
  });

  it("draws the missing Beer detail and history surfaces", () => {
    const expected = new Map<string, Screen["surface"]>([
      ["Vessel detail", undefined], ["Kick keg", "sheet"],
      ["Customer keg balance", undefined], ["Keg event history", undefined],
      ["Keg report", undefined], ["POS sale detail", undefined],
    ]);
    for (const [name, surface] of expected) {
      const screen = SCREENS.find((s) => s.name === name);
      expect.soft(screen, name).toBeTruthy();
      expect.soft(screen?.surface, name).toBe(surface);
    }
    for (const [name, count] of [["Cellar map", 6], ["Tap board", 11]] as const) {
      const screen = SCREENS.find((s) => s.name === name)!;
      const html = renderToStaticMarkup(createElement("div", null, screen.body));
      expect.soft(html.match(/<button/g)?.length ?? 0, `${name}: actionable tiles`).toBeGreaterThanOrEqual(count);
    }
  });

  it("draws the missing More and Settings destinations", () => {
    const expected = new Map<string, Screen["surface"]>([
      ["Customer detail", undefined], ["Ship-to form", "sheet"], ["Compliance months", undefined],
      ["Locations", undefined], ["Location detail", undefined],
      ["Add material", "sheet"], ["Edit material", "sheet"], ["Vendor", "sheet"], ["Contracts", undefined],
      ["Contract", "sheet"], ["SKU list", undefined], ["Team member", "sheet"],
    ]);
    for (const [name, surface] of expected) {
      const screen = SCREENS.find((s) => s.name === name);
      expect.soft(screen, name).toBeTruthy();
      expect.soft(screen?.surface, name).toBe(surface);
    }
    const bodyText = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    for (const destination of ["Vendors", "Formats", "Price group", "Settings"]) {
      expect.soft(bodyText("More"), destination).toContain(destination);
    }
    // Settings is the one home of the setup pages, and Chat is in Me (#1513).
    for (const moved of ["Sale channels", "Locations", "Chat"]) expect.soft(bodyText("More"), moved).not.toContain(moved);
    for (const destination of ["Sale channels", "Locations", "Import", "Chat"]) expect.soft(bodyText("Settings"), destination).toContain(destination);
    expect(bodyText("Team")).not.toContain("Remove selected member");
    expect(bodyText("Import")).toContain("Settings");
    expect(bodyText("Planning")).toContain("More");
  });

  it("splits list pages from their row editors", () => {
    const sheets = ["Invite portal user", "Fix mapping", "Package BOM", "SKU", "Brand approval", "State registration", "License", "Channel", "Format", "Bin"];
    for (const name of sheets) expect.soft(SCREENS.find((s) => s.name === name)?.surface, name).toBe("sheet");
    expect(SCREENS.find((s) => s.name === "Invoice")?.surface).toBeUndefined();
    for (const name of ["Customers", "Invoices", "Catalog", "Vendors", "Licenses", "Sale channels", "Formats", "Price group"]) {
      const html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
      expect.soft(html, `${name}: inline save`).not.toMatch(/>Save[^<]*<\/button>/);
    }
    const product = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Brand")!.body));
    expect(product).not.toContain("Save SKU");
  });

  it("lets portal buyers type quantities in both order steps", () => {
    const html = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    expect(html("Shop").match(/<input[^>]*type="number"/g)!.length).toBeGreaterThanOrEqual(3);
    for (const value of [4, 6, 0]) expect(html("Shop")).toContain(`value="${value}"`);
    expect(html("Review order").match(/<input[^>]*type="number"/g)).toHaveLength(2);
  });

  it("groups the portal shop by brand and listed package, with no last-week or stock badge", () => {
    const html = body("Shop");
    expect(html).not.toMatch(/Same as last week/);
    expect(html).not.toMatch(/in stock|low stock|out of stock|\bATP\b/i);
    expect(html).toMatch(/<h2[^>]*>Hazy IPA</);
    expect(html).toMatch(/<h2[^>]*>Pils</);
    expect(html).toMatch(/<h2[^>]*>Stout</);
    expect(html).toMatch(/½ bbl keg/);
    expect(html).toMatch(/⅙ bbl keg/);
    expect(html).toMatch(/case · 24×16/);
    expect(html).toMatch(/bottle/);
    expect(html.indexOf("Hazy IPA")).toBeLessThan(html.indexOf("½ bbl keg"));
  });

  it("lets a packaging plan designate which outputs are on the wholesale list", () => {
    const html = body("Schedule packaging run");
    expect(html).toMatch(/On the wholesale list/);
    expect(html).toMatch(/role="switch"/);
    expect(html).toMatch(/⅙ bbl keg/);
  });

  it("renders status and setting values as non-action controls", () => {
    const render = (node: ReturnType<typeof E.row>) => renderToStaticMarkup(createElement("div", null, node));
    expect(render(E.status("Active", "ok"))).not.toContain("<button");
    expect(render(E.status("Required", "w"))).toContain("Required");
    expect(render(E.sw(true, "Card payments"))).toContain('role="switch"');
    expect(render(E.sw(true, "Card payments"))).toContain('aria-checked="true"');
  });

  it("keeps row actions to verbs", () => {
    const verbs = new Set([
      "Correct receipt", "Add brew turn", "Correct turn 1", "Correct turn 2",
      "Add", "Add stop", "Add to route", "Adjust", "Assign", "Cancel plan", "Reschedule", "Change", "Check", "Check in", "Choose lot", "Choose who gets it", "Close", "Confirm", "Confirm all", "Connect", "Count", "Create",
      "Deliver", "Disconnect", "Discard", "Edit", "Edit par", "Edit prices", "Edit SKU", "Finish", "Fix", "Invite", "Kick", "Map", "Mark answered", "Mark sent", "Open", "Open format",
      "Open in QuickBooks", "Open mapping", "Pay", "Pick", "Pick source", "Put back", "Reading", "Receive", "Record movement", "Record opening count", "Record return", "Release", "Reload", "Remove", "Reorder", "Re-push",
      "Resolve", "Resume", "Retry", "Return", "Return and credit", "Review", "Review history", "Review sales", "Select", "Send", "Send PO", "Set vendor", "Shortfall", "Skip", "Start", "Swap", "Switch", "Tap",
      "Unlink", "Use", "Write off", "Fix registration", "Forgot password?", "Import CSV", "Invite staff", "Invite portal user",
    ]);
    for (const screen of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, screen.body));
      for (const [, label] of html.matchAll(/<button[^>]*data-row-action="true"[^>]*>([^<]+)<\/button>/g)) {
        expect.soft(verbs.has(label), `${screen.name}: ${label}`).toBe(true);
      }
    }
  });

  it("resolves detail back links to a screen or shell destination", () => {
    const shellDestinations = new Set([
      "Search", "Today", "Work", "More", "Beer", "Settings", "Catalog",
      "Compliance", "Chat", "Invoices", "Pick",
    ]);
    const screenNames = new Set(SCREENS.map((s) => s.name));
    for (const s of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      // A link whose customer copy is not the screen's name declares its
      // destination with data-to (Sign in's "Forgot password?" → Reset password).
      for (const [, tag, link] of html.matchAll(/(<a [^>]*>)(.*?)<\/a>/g)) {
        if (/href="https:\/\//.test(tag)) continue;
        const target = tag.match(/data-to="([^"]*)"/)?.[1] ?? link.replace(/<[^>]*>/g, "");
        // Provider navigation stays inert in inventory fixtures; live views receive the verified URL.
        if (target === "Open in QuickBooks" && /href="#"/.test(tag)) continue;
        expect.soft(
          screenNames.has(target) || shellDestinations.has(target) || /^[A-Z]{2,3}-\d+$/.test(target),
          `${s.name}: unresolved back target ${target}`,
        ).toBe(true);
      }
    }
  });

  it("threads one invoice through the AR, portal and venue frames", () => {
    const names = [
      "Invoices", "Review order", "Order history",
      "Pay invoice", "Payment unavailable", "Invoice history",
      "Pushed invoice", "Payment", "Credit memo",
    ];
    for (const s of SCREENS.filter((s) => names.includes(s.name))) {
      const text = renderToStaticMarkup(createElement("div", null, s.body)).replace(/<[^>]*>/g, " ");
      if (s.name === "Review order") {
        expect.soft(text, s.name).toContain("828");
        expect.soft(text, s.name).toContain("Tax pending");
        expect.soft(text, s.name).toContain("948.00 before tax");
      } else expect.soft(text, s.name).toContain("948");
      expect.soft(text, s.name).not.toMatch(/1,051|1,240|\b185\.00|\b740\.00|\b252\.00|\b114\.00/);
    }
    const pushed = SCREENS.find((s) => s.name === "Pushed invoice")!;
    const venue = renderToStaticMarkup(VenueFrame({ venue: pushed.venue!, children: pushed.body }));
    expect(venue).toContain("9/3/26");
    expect(venue).not.toContain("9/11/26");
    const grid = SCREENS.find((s) => s.name === "Price groups")!;
    // Grid cells are dollar fields: the price is the input's value.
    const gridHtml = renderToStaticMarkup(createElement("div", null, grid.body));
    expect(gridHtml).toContain('value="150.00"');
    expect(gridHtml).not.toContain('value="185.00"');
    const history = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Invoice history")!.body));
    expect(history.match(/INV-1042/g)).toHaveLength(1);
    expect(history).not.toContain("INV-0198");
    expect(history).toContain("Pay");
  });

  it("gives Save screens an editable input, select or toggle choice", () => {
    // A Save button that writes a value must sit next to a real editable
    // control, including the multi-select toggle group used for staff roles
    // and a searchable pick (E.searchPick): a labelled trigger, so it has an id,
    // that opens its list in a dialog (the QuickBooks mapping picker, #1515).
    for (const screen of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, screen.body));
      if (!/<button[^>]*>Save/.test(html)) continue;
      expect.soft(
        /<input\b/.test(html) || html.includes('role="combobox"') || /<button\b[^>]*aria-pressed=/.test(html)
          || /<button\b(?=[^>]*data-slot="dialog-trigger")(?=[^>]*\bid=")[^>]*>/.test(html),
        `${screen.name}: Save without an editable control`,
      ).toBe(true);
    }
  });

  it("marks pickable fields and never pins Required on a filled one", () => {
    const chevrons = new Map([
      ["Record movement", 1], ["Composer proposal", 1],
      ["Brew day", 3], ["Cycle count", 1],
      ["Chat settings", 2],
    ]);
    for (const s of SCREENS.filter((s) => !s.venue)) {
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      expect.soft(html, `${s.name}: Required pill`).not.toMatch(/<button[^>]*>Required<\/button>/);
      if (chevrons.has(s.name)) {
        expect.soft(html.match(/data-direction="forward"/g)?.length ?? 0, `${s.name}: picker affordances`).toBeGreaterThanOrEqual(chevrons.get(s.name)!);
      }
      if (s.name === "Schedule packaging run") {
        expect.soft(html.match(/role="combobox"/g), "Schedule packaging run: Brand and Source tank dropdowns").toHaveLength(2);
      }
      expect.soft(html, `${s.name}: Unicode direction arrow`).not.toMatch(/[→›]/);
    }
  });


  it("keeps phone tables contained and avoids duplicate page titles", () => {
    const menu = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Menu")!.body));
    const pos = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Point of sale")!.body));
    const formats = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Formats")!.body));
    expect(menu.match(/<h[12][^>]*>[^<]*(?:POS )?menu/gi)).toHaveLength(1);
    expect(pos.match(/<h[12][^>]*>Point of sale/gi)).toHaveLength(1);
    // RecordTable lets long names wrap instead of widening past the column, and
    // the phone gets a labeled list rather than a scrolling table (#1025).
    expect(formats).not.toContain("min-w-max");
    expect(formats).toContain('role="listitem"');
    const slack = SCREENS.find((s) => s.name === "Notification preferences")!;
    expect(renderToStaticMarkup(VenueFrame({ venue: slack.venue!, children: slack.body }))).toContain('class="slk modal"');
  });

  it("identifies Team members by name and full email, never a domain-elided address", () => {
    for (const s of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      // "maria@ · warehouse" reads as truncated data.
      expect.soft(html, `${s.name}: elided address`).not.toMatch(/[a-z0-9]@(?![a-z0-9.])/i);
    }
    expect(body("Team")).toContain("Maria Alvarez");
    expect(body("Team")).toContain("maria@demobrewing.com");
    // The `Name <email>` title already carries the email; no row repeats it beneath.
    expect(body("Team member")).not.toMatch(/data-slot="item-description"[^>]*>[^<]*dave@demobrewing\.com/);
    // Pending acceptance is not exposed by the live roster.
    expect(body("Team")).not.toContain("pending");
  });

  it("renders a date field with no value, and names it", () => {
    // An empty or malformed value used to reach Intl.format as an Invalid Date,
    // which throws and takes the whole screen down with it.
    for (const value of ["", "not-a-date", "2027-08-31"]) {
      const html = renderToStaticMarkup(createElement("div", null, E.edit("Best by", value, "date")));
      expect.soft(html, value).toContain("aria-labelledby");
      expect.soft(html, value).toContain("Best by");
    }
    expect(renderToStaticMarkup(createElement("div", null, E.edit("Best by", "", "date")))).toContain("Pick a date");
  });

  it("renders the controlled date value used by live shared forms", () => {
    const html = renderToStaticMarkup(createElement(DatePicker, { label: "Date", defaultValue: "", value: "2027-08-31", onChange: () => {} }));
    // The app-wide record date (lib/date-format.ts formatDate).
    expect(html).toContain("Aug 31, 2027");
  });

  it("shows a date typed with a year below 1000 instead of failing the form", () => {
    // The native date input reports each year digit as typed: 0002, 0020, 0202, 2026.
    const html = renderToStaticMarkup(createElement(DatePicker, { label: "Date", value: "0002-10-22", name: "date", onChange: () => {} }));
    expect(html).toContain("Oct 22, 2");
    expect(html).toContain('value="0002-10-22"');
  });

  it("points a date field at its description, as the other fields do", () => {
    const html = renderToStaticMarkup(createElement("div", null, E.edit("Best by", "", "date", undefined, { "aria-describedby": "best-by-help" })));
    expect(html).toMatch(/<button[^>]*aria-describedby="best-by-help"/);
  });


  it("falls back to initials when a person has no fixture photo", () => {
    const render = (node: ReturnType<typeof E.face>) => renderToStaticMarkup(createElement("div", null, node));
    // Initials sit under the photo, so the markup a static export ships keeps
    // the real src; a person with no fixture shows letters instead.
    expect(render(E.face({ name: "Maria Alvarez" }))).toContain(">MA<");
    expect(render(E.face({ name: "Ted" }))).toContain(">T<");
    expect(render(E.face({ name: "wes@demobrewing.com" }))).toContain(">W<");
    // list_team_members titles a named member `Name <email>` (#1659).
    expect(render(E.face({ name: "Maria Alvarez <maria@demobrewing.com>" }))).toContain(">MA<");
    expect(render(E.face({ name: "Ted <ted@demobrewing.com>" }))).toContain(">T<");
    expect(render(E.face({ name: "Maria Alvarez" }))).not.toContain("<img");
    // Every other call keeps its photo: no name and no path is the signed-in user.
    expect(render(E.face())).toContain('src="/mock/maria.jpg"');
    expect(render(E.face({ src: "/mock/dave.jpg" }))).toContain('src="/mock/dave.jpg"');
    expect(render(E.face({ className: "size-10" }))).toMatch(/size-10[\s\S]*src="\/mock\/maria.jpg"/);
  });

  it("keeps one signed-in staff identity: Maria, admin, with the face", () => {
    // The gallery shell signs in as admin (screen-frame.tsx) so every surface is
    // reachable, so the person the screens name has to be that admin.
    expect(body("Me")).toMatch(/Maria Alvarez[\s\S]*admin/);
    expect(body("Team")).toMatch(/Maria Alvarez &lt;maria@demobrewing\.com&gt;[\s\S]*Admin[\s\S]*you/);
    // Team member acts on someone else; removing yourself is the self state.
    expect(body("Team member")).not.toMatch(/Maria|@maria/);

    // Fixture files are named for the person; each src may only appear next to that name.
    const faces: [string, RegExp][] = [
      ["/mock/maria.jpg", /Maria|maria@/],
      ["/mock/dave.jpg", /Dave/],
      ["/mock/ted.jpg", /Ted/],
      ["/mock/sam.jpg", /Sam/],
    ];
    for (const [src] of faces) {
      expect(existsSync(resolve("public", src.slice(1))), src).toBe(true);
    }
    const team = body("Team");
    for (const [src] of faces) expect(team, src).toContain(`src="${src}"`);
    expect(body("Me")).toContain('src="/mock/maria.jpg"');
    expect(body("Me")).not.toContain("/mock/dave.jpg");
    expect(body("Team member")).toContain('src="/mock/dave.jpg"');
    expect(body("Team member")).not.toContain("/mock/maria.jpg");
    for (const s of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      if (!html.includes("data-mock-avatar")) continue;
      expect.soft(s.portal, `${s.name}: the portal buyer is not the staff user`).toBeUndefined();
      for (const [src, who] of faces) {
        if (html.includes(src)) expect.soft(html, `${s.name}: ${src}`).toMatch(who);
      }
    }
  });

  it("shows format volume in familiar brewery units", () => {
    const formats = body("Formats");
    // The header's label sits in its sort button, before the arrow.
    expect(formats).toMatch(/<th\b[^>]*>(?:(?!<\/th>)[\s\S])*>Volume</);
    for (const volume of ["16 oz", "64 oz", "3 gal", "½ bbl"]) expect.soft(formats, volume).toContain(volume);
    expect(formats).not.toContain("bbl / format");
  });

  it("keeps volume on formats while SKUs choose a format", () => {
    const sku = body("SKU");
    expect(sku).toContain(">Format<");
    expect(sku).not.toMatch(/bbl per unit|Units per case|Package BOM|Packaging overrides/);

    const format = body("Format");
    // The visible label names the input (no aria-label overriding it), and the unit bar rides in its group.
    const sizeId = /<label[^>]*for="([^"]+)"[^>]*>Size of one container<\/label>/.exec(format)?.[1];
    expect(sizeId).toBeTruthy();
    expect(format).toMatch(new RegExp(`data-slot="input-group"[\\s\\S]*<input[^>]*id="${sizeId}"[\\s\\S]*role="tablist"`));
    expect(format).not.toContain('aria-label="Size of one container"');
    expect(format).toContain("Container");
    expect(format).toContain("Beer per package");
    expect(format).toContain("Containers per package");
    expect(format).toMatch(/role="tablist"[^>]*>[\s\S]*oz[\s\S]*gal[\s\S]*bbl/);
    for (const unit of ["oz", "gal", "bbl"]) expect.soft(format, unit).toContain(`>${unit}</button>`);
    for (const unit of ["mL", "L"]) expect.soft(format, unit).not.toContain(`>${unit}</button>`);

    const metric = renderToStaticMarkup(createElement(VolumeField, { value: "500", units: ["mL", "L"], on: 0 }));
    expect(metric).toContain(">mL</button>");
    expect(metric).toContain(">L</button>");
    expect(metric).not.toContain(">bbl</button>");
  });

  it("keeps external venue facts in the host product's vocabulary", () => {
    const venueHtml = (name: string) => {
      const screen = SCREENS.find((s) => s.name === name)!;
      return renderToStaticMarkup(VenueFrame({ venue: screen.venue!, children: screen.body }));
    };
    expect(venueHtml("Pushed invoice")).toMatch(/Keg deposit[\s\S]*NON/);
    expect(venueHtml("Push rejected")).not.toContain("qa-ft");
    expect(venueHtml("Square sales receipt")).toMatch(/Sales receipt[\s\S]*Square customer/);
    expect(venueHtml("Taproom sale")).not.toMatch(/<b>Channel<\/b>/);
    expect(venueHtml("Refund").indexOf("10:51 pm")).toBeLessThan(venueHtml("Refund").indexOf("10:32 pm"));
    expect(venueHtml("Published item")).not.toContain("• Pint");
    expect(venueHtml("Published item")).not.toContain("SQ-8841");
    expect(venueHtml("Notification preferences")).toContain('role="switch"');
    expect(venueHtml("Notification preferences")).toContain("<select");
  });

  it("gives sheets no separate header; their title is the record name", () => {
    expect(SCREENS.filter((s) => s.surface === "sheet" && s.hd)).toEqual([]);
  });

  it("types quantities in a native decimal input instead of a number pad", () => {
    // Issue 93: the OS keyboard is the keypad. #73's pin stays around the
    // commit so the verb remains on the phone after the pad is gone.
    const named = [
      "Record movement", "Fermentation reading", "Cellar addition",
      "Cellar transfer", "Cycle count", "Repack",
    ];
    for (const screen of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, screen.body));
      for (const [, label] of html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)) {
        expect.soft(label, `${screen.name}: pad key ${label}`).not.toMatch(/^(?:\d|⌫)$/);
      }
    }
    for (const name of named) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const { pin } = splitPinned(s!.body);
      expect(pin.length, `${name}: pin lifted`).toBe(1);
      expect.soft(renderToStaticMarkup(createElement("div", null, s!.body)), `${name}: number input`).toMatch(/<input[^>]*type="number"/);
      const pinHtml = renderToStaticMarkup(createElement("div", null, pin));
      expect(pinHtml, `${name}: commit verb inside pin`).toMatch(/Record (movement|addition|transfer|count|repack)|Save reading/);
    }
    const transfer = SCREENS.find((x) => x.name === "Cellar transfer")!;
    const transferHtml = renderToStaticMarkup(createElement("div", null, transfer.body));
    expect(transferHtml).not.toMatch(/border-l-2/);
    // record_cellar_transfer is live (#278 slice 2): the tag no longer says design.
    expect(transfer.writes).not.toMatch(/\[design/);
    // record_repack is live (#278 slice 6): the child leg is derived, so the gate is lifted.
    expect(SCREENS.find((x) => x.name === "Repack")!.writes).not.toMatch(/SCHEMA-GATE/);
  });

  it("gives every Work create form the shared E.pin footer (#1226)", () => {
    // One placement: primary on the right on the desk, full width on a phone.
    // The live pages mount these same views, so the record is the proof.
    const pinned = (name: string) => body(name).match(/<div data-pin="true"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    for (const [name, verb] of [["New PO", "Save draft"], ["New order", "Save draft"], ["Route", "Save route plan"]]) {
      expect(pinned(name), `${name}: commit inside the pin`).toMatch(new RegExp(`<button[^>]*>${verb}</button>`));
    }
    // Depart is the planned route's one primary, so it is last: rightmost on the desk.
    expect(pinned("Route")).toMatch(/Save route plan<\/button>[\s\S]*Depart route<\/button>$/);
  });

  it("puts the commit on the row, not a second copy at the top", () => {
    // Issue 97: Today-family top buttons duplicated the row verb; Order had
    // Adjust line plus trailing adjust; Confirm order said Next: confirm twice.
    const html = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    expect(html("Today")).not.toMatch(/Pick · 3 ready/);
    expect(html("Today")).toMatch(/data-row-action[^>]*>Pick</);
    // The weekly count is live (record_taproom_count): Today draws no gated stand-in for it.
    expect(html("Today")).not.toMatch(/data-gated/);
    // New order is Sales' quick action above the rows (#1513), not a row verb.
    expect(html("Sales")).toMatch(/<button[^>]*>New order</);
    expect(html("Brewer")).not.toMatch(/grid-cols-2/);
    expect(html("Taproom")).not.toMatch(/<button[^>]*>Swap keg</);
    expect(html("Taproom")).toMatch(/data-row-action[^>]*>Open</);
    expect(html("Driver")).toMatch(/Resume/);
    expect(html("Order")).not.toMatch(/Adjust line/);
    expect(html("Order")).toMatch(/>Add line</);
    // Lines change in place (#1503): each line's ✕ draws in the desk table and again in the phone list.
    expect(html("Order").match(/aria-label="Remove [^"]+"/g)).toHaveLength(6);
    expect(html("Order")).not.toMatch(/>Adjust</);
    expect(html("Confirm order")).toMatch(/Submitted · ships Sep 10, 2026/);
    expect(html("Confirm order")).not.toMatch(/Next: confirm/);
    expect(html("Confirm order")).toMatch(/>Confirm order</);
    const empty = html("Today empty");
    expect(empty).toMatch(/Nothing waiting/);
    expect(empty).toMatch(/>Record movement</);
  });

  it("uses one verb and buyer copy on the named landings", () => {
    // Issue 85: Brewer Start vs Brew day, Sales ATP jargon, Driver after-as-button.
    const brewer = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Brewer")!.body));
    expect(brewer).toMatch(/Start/);
    expect(brewer).not.toMatch(/>Brew day</);
    const sales = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Sales")!.body));
    expect(sales).toMatch(/Not enough Pils/);
    expect(sales).not.toMatch(/ATP/);
    const driver = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Driver")!.body));
    expect(driver).not.toMatch(/>after</);
    const me = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Me")!.body));
    expect(me).toMatch(/Switch/);
  });

  it("draws locked-out landings and the composer question", () => {
    // Issue 83: no-membership, expired invite/reset, session expiry with the
    // outbox kept, and the composer question (chips, no Commit).
    for (const name of ["No membership", "Portal staff only", "Expired invite", "Expired reset", "Session expired", "Composer question"]) {
      expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    }
    const q = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Composer question")!.body));
    expect(q).not.toMatch(/Commit/);
    const staffOnly = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Portal staff only")!.body));
    expect(staffOnly).toMatch(/Back to Today/);
    expect(staffOnly).not.toMatch(/Create brewery/);
    const accept = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Accept invite")!.body));
    expect(accept).toMatch(/name|Name/i);
    const search = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Search")!.body));
    expect(search).toMatch(/SKU/);
  });

  it("draws the driver route, put back, and ship-on-delivery work screens", () => {
    // Issue 81: Put back was a Today verb with no screen; the driver route
    // was only the planner; Confirm shipment was a second Ship title.
    for (const name of ["Driver route", "Put back", "Ship on delivery"]) {
      expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    }
    expect(SCREENS.some((s) => s.name === "Confirm shipment")).toBe(false);
    const pickSheet = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Pick sheet")!.body));
    expect(pickSheet).toMatch(/>Pick</);
    expect(pickSheet).toMatch(/Thu/);
    const pick = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Pick")!.body));
    expect(pick).toMatch(/Print/);
    const deliveryStatus = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Confirm delivery")!.body));
    expect(deliveryStatus).not.toContain('data-direction="forward"');
    const receive = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Receive PO")!.body));
    expect(receive).not.toMatch(/Send PO/);
    const close = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Close packaging run")!.body));
    expect(close).not.toMatch(/Print labels/);
    expect(close).toMatch(/started/);
    const delivery = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Confirm delivery")!.body));
    expect(delivery).toMatch(/Route A/);
    expect(delivery).not.toMatch(/Type name/);
  });

  it("gives every MGR screen states, and keeps engineering phrases off the glass", () => {
    // Issue 79: missing empty/offline/permission/already-done/error states, and
    // policy copy (RPC, occupancy/B-0416, source of truth, callback) on the device.
    const banned = /source of truth|Last callback|Retry eligible|occupancy\/B-|One RPC |\bpersisted\b/;
    for (const s of SCREENS) {
      if (s.venue) continue;
      expect(s.states?.length, s.name).toBeGreaterThan(0);
      const body = renderToStaticMarkup(createElement("div", null, s.hd, s.body));
      expect(body, s.name).not.toMatch(banned);
    }
    for (const name of ["Shipment done", "Run closed", "Receipt"]) {
      expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    }
  });

  it("gives the portal an Account tab, entry, Me, order detail and invoice follow-ups", () => {
    // Issue 77: Account was drawn but unreachable; buyer entry, Me, order
    // detail, dispute, paid invoice and disabled-primary reasons were missing.
    const names = [
      "Portal sign in", "Portal forgot password", "Portal set password", "Portal Me",
      "Order detail", "Question invoice", "Paid invoice",
    ];
    for (const name of names) expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    const shop = SCREENS.find((s) => s.name === "Shop")!;
    const shopHtml = renderToStaticMarkup(createElement("div", null, shop.body));
    expect(shopHtml).toMatch(/Ships from/);
    expect(shopHtml).toMatch(/Review order/);
    const history = SCREENS.find((s) => s.name === "Order history")!;
    const historyHtml = renderToStaticMarkup(createElement("div", null, history.body));
    expect(historyHtml).toMatch(/ORD-0225/);
    expect(historyHtml).toMatch(/Reorder/);
    const detailHtml = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Order detail")!.body));
    expect(detailHtml).toMatch(/Reorder/);
  });

  it("inventory drawings do not leak live back/list hrefs", () => {
    const banned = /href="\/(orders|portal|customers|invoices)(\/|"|\?)/;
    for (const s of SCREENS) {
      if (s.venue) continue;
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      expect(html, s.name).not.toMatch(banned);
    }
  });

  it("puts a stepper on quantity rows and leaves reason unchosen", () => {
    // Issue 75: quantities were static text. Pick had no way to change a
    // count. Short pick and Ship and invoice preselected a reason.
    const qty = [
      "Pick", "Receive PO", "Return and credit", "New order",
      "Schedule packaging run",
    ];
    for (const name of qty) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const html = renderToStaticMarkup(createElement("div", null, s!.body));
      expect(html, name).toMatch(name === "New order" ? /aria-label="Decrease Line 1 quantity"/ : /aria-label="Decrease"/);
    }
    for (const name of ["Short pick", "Ship and invoice"]) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const html = renderToStaticMarkup(createElement("div", null, s!.body));
      expect(html, name).toMatch(/Reason/);
      expect(html, name).toMatch(/required/);
      expect(html, `${name}: no reason chips`).not.toMatch(/>damaged</);
    }
  });

  it("keeps weekly quantity steppers in the worksheet, not the selected saved receipt", () => {
    expect(body("Weekly count")).toContain('aria-label="Saved count"');
    expect(body("Weekly count")).not.toContain('aria-label="Decrease"');
    const worksheet = renderToStaticMarkup(createElement(WeeklyCountView, { model: { ...weeklyCount, receipt: undefined } }));
    expect(worksheet).toContain('aria-label="Decrease"');
    expect(worksheet).toContain('aria-label="Count every stock bucket"');
  });

  it("edits a whole number with the same stepper Weekly count uses", () => {
    // A contract quantity or an overdue threshold is counted, not typed: the
    // −/+ stepper (E.stq) is the one number control, as on Weekly count.
    // The pair table is the whole check: the regex fails if the stepper is
    // missing as surely as if it is not the labelled field. Labels are escaped
    // so a field may be named for a reader, parentheses and all.
    for (const [name, label] of [["Contract", "Contract quantity"], ["Settings", "Reading overdue after (hours)"]]) {
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(body(name), `${name}: the stepper is not the labelled field`).toMatch(new RegExp(`aria-label="Decrease"[^§]*aria-label="${esc}"`));
    }
  });

  it("uses the full desktop width instead of a centred phone column (#98)", () => {
    // Issue 98: the shell was capped at a phone column, buttons kept a fixed
    // grid and tiles were locked to three, so desktop drew wide gutters.
    // children in the props object keeps this a plain createElement call in a
    // .ts test; the lint rule only allows it away from a literal.
    const shellProps = { brand: "Demo", items: [], active: "Today", children: "body" };
    const shell = renderToStaticMarkup(createElement(AppShell, shellProps));
    expect(shell).not.toMatch(/md:max-w-/);
    expect(shell).not.toContain("md:max-w-2xl");
    const btns = renderToStaticMarkup(E.btns([["Save", "p"], ["Cancel", "g"], ["Third", "g"]], "c3"));
    expect(btns).toContain("md:flex");
    expect(btns).not.toContain("md:grid-cols-3");
    const tiles = renderToStaticMarkup(E.tiles([["FV1", "Pils"], ["FV2", "Hazy"]]));
    expect(tiles).toContain("auto-fill");
    // Page actions fill the phone column and hug the label from md up. Entry
    // cards stay a phone-width column even on a desk, so they keep the fill.
    const btn = renderToStaticMarkup(E.btn("Save"));
    expect(btn).toContain("w-full");
    expect(btn).toContain("md:w-fit");
    const pin = renderToStaticMarkup(E.pin(E.btn("Record")));
    expect(pin).toContain("md:flex-row");
    expect(pin).toContain("md:justify-end");
    const signIn = SCREENS.find((s) => s.name === "Sign in")!;
    const signInHtml = renderToStaticMarkup(createElement(ScreenFrame, { screen: signIn }));
    expect(signInHtml).toMatch(/\[&amp;_\[data-slot=button\]\]:w-full/);
    expect(signInHtml).toContain("md:max-w-[420px]");
  });

  it("never lets a flex column crush E.tbl below its rows (#1037)", () => {
    // Screens stack in a flex column; a shrinkable scroll box collapsed Planning's week table to one line.
    expect(renderToStaticMarkup(E.tbl(["week"], [["Sep 7, 2026"]]))).toMatch(/^<div class="shrink-0"><div data-slot="table-container"/);
  });

  it("places list-create actions on the title row", () => {
    // A New/Add/Create/Schedule on a list is a header action, not a second
    // full-width row between the title and the list. Form commits, in-form
    // Add line, and the first-run inline Add location stay in the body.
    const hd = renderToStaticMarkup(E.hd("Work", "sales default", E.btn("New order")));
    expect(hd).toContain("md:flex-row");
    expect(hd).toContain("md:justify-between");
    expect(hd).toContain("New order");
    const back = renderToStaticMarkup(E.back("More", "Customers", E.btn("New customer")));
    expect(back).toContain("md:flex-row");
    expect(back).toContain("New customer");
    for (const [name, action] of [
      ["Work", "New order"], ["Orders", "New order"], ["Transfers", "New transfer"], ["Batches", "New batch"],
      ["Packaging runs", "Schedule run"], ["Purchase orders", "New PO"], ["Routes", "New route"],
      ["Locations", "Add location"], ["Finished goods", "Add SKU in Catalog"], ["Customers", "New customer"],
      ["Catalog", "New brand"],
      ["Materials on hand", "Add material"], ["Vendors", "Add vendor"],
      ["Contracts", "Add contract"], ["Recipes", "New recipe"], ["Price groups", "New price group"],
    ] as const) {
      const html = body(name);
      expect(html, name).toMatch(new RegExp(`md:flex-row[^>]*>[\\s\\S]*${action}`));
      const at = html.indexOf(`>${action}<`);
      const item = html.indexOf('data-slot="item"');
      expect(at, name).toBeGreaterThan(-1);
      if (item !== -1) expect(at, `${name}: ${action} before the list`).toBeLessThan(item);
    }
    expect(body("Me")).toMatch(/md:flex[\s\S]*Change password[\s\S]*Sign out/);
    expect(body("Portal Me")).toMatch(/md:flex[\s\S]*Change password[\s\S]*Sign out/);
    const firstRun = body("First-run checklist");
    expect(firstRun).not.toMatch(/md:flex-row[^>]*>[\s\S]*Set up Demo Brewing[\s\S]*Add location/);
    expect(firstRun).toMatch(/>Add location</);
  });

  it("labels every field over its control and marks only nav and verb rows as taps", () => {
    const r = (n: unknown) => renderToStaticMarkup(createElement("div", null, n as never));
    // A blank input carries a real label; the example is the placeholder.
    const inp = r(E.edit("Address", "", "text", undefined, { placeholder: "114 Bridge St" }));
    expect(inp).toMatch(/<label[^>]*>Address<\/label>/);
    expect(inp).toContain('placeholder="114 Bridge St"');
    const search = r(E.search("Search customers"));
    expect(search).toMatch(/type="search"/);
    expect(search).not.toContain("<label");
    // No field is drawn label-beside-control any more.
    for (const s of SCREENS) expect.soft(body(s.name), s.name).not.toMatch(/data-slot="field"[^>]*data-orientation="horizontal"/);
    // Grids: cols pairs from md up; inline sizes to its count at every width.
    expect(r(E.cols(E.edit("A", "1"), E.edit("B", "2")))).toContain("md:grid-cols-2");
    expect(r(E.inline(E.edit("A", "1"), E.edit("B", "2")))).toMatch(/class="[^"]*\bgrid-cols-2\b/);
    expect(r(E.inline(E.edit("A", "1"), E.edit("B", "2"), E.edit("C", "3")))).toMatch(/class="[^"]*\bgrid-cols-3\b/);
    // Rows declare a tap through their trailing slot: the chevron and a verb do, a switch or stepper does not.
    expect(r(E.nav("Open me"))).toMatch(/data-tap="/);
    expect(r(E.row("Verb", "", E.act("Review")))).toMatch(/data-tap="/);
    expect(r(E.row("Switch", "", E.sw(true, "On")))).not.toMatch(/data-tap="/);
    expect(r(E.row("Stepper", "", E.stq(3)))).not.toMatch(/data-tap="/);
    expect(r(E.gated("Later"))).toContain("data-gated");
  });

  it("uses the control that does the job on view switchers and roles (#99)", () => {
    // Issue 99: filter chips were standing in for view switchers, a
    // one-option chip group, a link and a role editor.
    const html = (name: string) =>
      renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    // Tap board's taproom choice is a Location select since #973 (tests/location-scope.test.ts).
    for (const name of ["Chat settings", "Menu", "Variance by brand"]) {
      expect(html(name), name).toContain("tablist");
    }
    for (const name of ["Work", "Orders", "Transfers", "Batches", "Packaging runs", "Purchase orders", "Routes"]) {
      expect(html(name), name).toContain("tablist");
    }
    // Each Work kind page is titled by its sidebar name; only the all-kinds page says Work (#1037, #1104).
    const h1 = (name: string) => html(name).match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1];
    expect(["Work", "Orders", "Transfers", "Batches", "Packaging runs", "Purchase orders", "Routes"].map(h1))
      .toEqual(["Work", "Orders", "Transfers", "Batches", "Packaging", "Purchase orders", "Deliveries"]);
    expect(html("Packaging runs")).toContain("data-active:bg-primary");
    // Record movement: seven kinds are a Select on the phone, chips from md up.
    const move = html("Record movement");
    expect(move).toContain("md:hidden");
    expect(move).toContain("hidden md:block");
    // Team: no selection-less bulk remove; the role editor lives on the
    // Team member sheet since #72 split editors out of list pages. Members
    // can hold several roles, so the shared editor supports multiple picks.
    expect(html("Team")).not.toMatch(/Remove selected member/);
    const member = html("Team member");
    expect(member).toContain('aria-label="Roles"');
    expect(member).toContain('data-slot="toggle-group-item"');
    expect(member).toContain("Choose one or more roles");
    expect(member).not.toContain('data-slot="select-trigger"');
    expect(member).not.toContain('role="switch"');
    // Sign in: a link, not a card row.
    expect(html("Sign in")).toMatch(/<a [^>]*>Forgot password\?<\/a>/);
    // Product: no one-option chip group.
    const brand = SCREENS.find((s) => s.name === "Brand")!;
    expect(body("Brand")).not.toContain("tax class");
    expect(JSON.stringify(brand.states)).toMatch(/tax class/);
    // Every date field is the calendar picker; no screen falls back to the OS date input.
    for (const name of ["New order", "New batch", "Schedule packaging run", "Receive PO", "Brew day", "Packaging plan"]) {
      expect(html(name), name).toContain('data-slot="popover-trigger"');
    }
    for (const s of SCREENS) {
      // DatePicker keeps a non-tabbable hidden input for native required validation.
      for (const [input] of html(s.name).matchAll(/<input[^>]*type="date"[^>]*>/g)) {
        expect.soft(input, s.name).toContain('class="sr-only"');
        expect.soft(input, s.name).toContain('tabindex="-1"');
      }
    }
    // No ToggleGroup is left with a single option.
    for (const s of SCREENS) {
      const groups = renderToStaticMarkup(createElement("div", null, s.body)).match(/data-slot="toggle-group"[\s\S]*?(?=data-slot="toggle-group"|$)/g) ?? [];
      for (const g of groups) {
        expect((g.match(/data-slot="toggle-group-item"/g) ?? []).length, s.name).not.toBe(1);
      }
    }
  });

  it("gives the named screens one filled primary each", () => {
    // Issue 71: two filled verbs on one body fight for the commit. Outline,
    // ghost, disabled and steppers are not the primary. A tile or
    // row act can still open the next screen.
    const named = [
      "Today", "Taproom", "Order", "Cellar map", "Tap board", "Swap keg",
      "Weekly count", "Brew day", "Route", "Settings", "Brand", "Vendors",
      "Planning", "New batch", "Vessel detail", "Kick keg", "Return route",
    ];
    const filled = (html: string) =>
      (html.match(/<button\b[^>]*>/g) ?? []).filter((b) =>
        /data-variant="(?:default|irreversible)"/.test(b)
        && !/\sdisabled(?:=["'][^"']*["'])?(?=[\s>])/.test(b)
        && !/data-size="icon"/.test(b),
      );
    for (const name of named) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const html = renderToStaticMarkup(createElement("div", null, s!.hd, s!.body));
      // Settings has three independent forms. Its equal-weight Save buttons
      // intentionally remain filled rather than implying one page-wide action.
      expect(filled(html).length, name).toBeLessThanOrEqual(name === "Settings" ? 3 : 1);
    }
  });

  it("treats a pour as a serving from the tap, not a SKU", () => {
    const brand = SCREENS.find((s) => s.name === "Brand")!;
    expect(String(brand.spec)).toMatch(/A pour is a serving from the tap, not a SKU/);
    expect(JSON.stringify(brand.states)).not.toMatch(/non-stock SKU/);
    expect(String(brand.spec)).not.toMatch(/draft pours are SKUs/i);
    expect(String(brand.spec)).not.toMatch(/SCHEMA-GATE:[^\]]*styles table/);
  });

  it("ungates Formats, Ship on delivery, and Shop once those writes exist", () => {
    expect(body("Formats")).not.toContain("data-gated");
    expect(body("Format")).not.toContain("data-gated");
    expect(String(SCREENS.find((s) => s.name === "Package BOM")!.writes)).not.toMatch(/SCHEMA-GATE/);
    const ship = SCREENS.find((s) => s.name === "Ship on delivery")!;
    expect((ship.states ?? []).map(([n]) => n)).not.toContain("schema gate");
    expect(body("Ship on delivery")).not.toMatch(/isn't available yet/);
    expect(body("Shop")).not.toMatch(/Review is unavailable/);
    expect(String(SCREENS.find((s) => s.name === "Shop")!.reads)).not.toMatch(/SCHEMA\/RLS-GATE/);
  });

  it("changes Order lines in place, with no Adjust lines page (#1503)", () => {
    expect(SCREENS.find((s) => s.name === "Order")!.to?.Adjust).toBeUndefined();
    expect(SCREENS.some((s) => s.name === "Adjust lines")).toBe(false);
    expect(SCREENS.find((s) => s.name === "Short pick")!.spec).toMatch(/Opens from a Pick line/);
    // A sheet over Pick, not a page round-trip per short line (#1503).
    expect(SCREENS.find((s) => s.name === "Short pick")!.surface).toBe("sheet");
  });

  it("draws the stock-transfer document separately from Complete transfer", () => {
    for (const name of ["Transfers", "New transfer", "Transfer detail"]) {
      expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    }
    expect(String(SCREENS.find((s) => s.name === "Transfers")!.writes)).toContain("create_stock_transfer");
    expect(String(SCREENS.find((s) => s.name === "Complete transfer")!.writes)).toContain("ship_order");
  });

  it("hides Water suggestions and the ion read-out, matching the live sheet (post-v1, #1481)", () => {
    const html = body("Water");
    expect(html).not.toMatch(/Suggest additions/);
    expect(html).not.toContain("data-gated");
    expect(html).not.toMatch(/Against target<\//);
    const water = SCREENS.find((s) => s.name === "Water")!;
    expect(String(water.spec)).toMatch(/post-v1/i);
  });
});

describe("order lifecycle labels", () => {
  it("name only order_status values on Order and Order detail", async () => {
    // Delivery is a route-stop event, not an order status (F67): a delivered
    // stop leaves the order shipped, drawn as the composite below.
    const { Constants } = await import("../lib/supabase/database.generated");
    const statuses = new Set<string>(Constants.public.Enums.order_status);
    const notLifecycle = new Set(["stale", "permission", "adjusted", "changed after pick", "shipped · stop delivered"]);
    for (const name of ["Order", "Order detail"]) {
      const labels = SCREENS.find((s) => s.name === name)!.states!.map(([label]) => label);
      const bad = labels.flatMap((label) => notLifecycle.has(label) ? [] : label.split(" / ").filter((part) => !statuses.has(part)));
      expect(bad, name).toEqual([]);
      expect(labels).toContain("shipped · stop delivered");
    }
    expect(readFileSync("components/mgr/views/confirm-order.tsx", "utf8")).not.toMatch(/shipped \{E\.arrow\(\)\} delivered/);
  });
});

describe("screen command tokens", () => {
  it("every reads/writes command is registered or tagged [design] or a gate", async () => {
    // An unregistered, untagged read silently gates a live screen (X85:
    // get_material_shortfalls hid Schedule packaging run). [view] is not a tag that excuses it.
    const { taggedOperations } = await import("../lib/mgr/screen-routes");
    const { getCommandDefinition } = await import("../lib/commands/registry");
    const bad = SCREENS.filter((s) => !s.venue).flatMap((s) => (["reads", "writes"] as const).flatMap((field) =>
      taggedOperations(s[field])
        .filter((t) => !getCommandDefinition(t.name) && !/\[design|GATE|\[platform|\[client state/.test(t.tag))
        .map((t) => `${s.name} ${field}: ${t.name}`)));
    expect(bad).toEqual([]);
  });
});

describe("vessel tile fill (#909)", () => {
  const tile = (fill?: number) => renderToStaticMarkup(E.tiles([["FV1", "Pils · 10 / 20 bbl", "6.2 °P", 0, fill, "/cellar/fv1"]]));

  it("draws a named progressbar carrying its whole-percent value", () => {
    const html = tile(50);
    expect(html).toContain('role="progressbar"');
    expect(html).toMatch(/aria-label="[^"]+"/);
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("bounds fill values to the progress range", () => {
    expect(tile(-10)).toContain('aria-valuenow="0"');
    expect(tile(200 / 3)).toContain('aria-valuenow="67"');
    expect(tile(125)).toContain('aria-valuenow="100"');
  });

  it("draws no bar for a tile without a fill", () => {
    expect(tile()).not.toContain("progressbar");
  });
});

describe("Confirm order shortage message (#990)", () => {
  it("names every short line in one message instead of one note per line", async () => {
    const { toConfirmOrderViewProps } = await import("../lib/mgr/confirm-order-view");
    const { ConfirmOrderView } = await import("../components/mgr/views/confirm-order");
    const { orderSubmittedRidgeline: base } = await import("../lib/mgr/fixtures/orders");
    const [hazy, pils] = base.lines;
    const extra = { id: "l-extra", sku_id: "sku-extra", qty_ordered: 2, skus: { name: "Extra stout · case" } };
    const model = toConfirmOrderViewProps({
      ...base,
      lines: [{ ...hazy, qty_ordered: 9 }, pils, extra],
      atp: [...base.atp, { sku_id: "sku-extra", qty: 1 }],
      sourceOnHand: [...base.sourceOnHand!, { sku_id: "sku-extra", qty: 5 }],
    });
    // The per-line marker stays on every short line.
    expect(model.lines.map((l) => l.tone)).toEqual(["w", "w", "w"]);
    expect(model.shortageNote).toBe(
      `Short at Warehouse: ${hazy.skus!.name}, ${pils.skus!.name}. Replenish Warehouse before picking, or confirm knowing the full quantity cannot be picked there. ` +
      "Confirming promises more than is available for Extra stout · case; that stays your call.",
    );
    const html = renderToStaticMarkup(createElement(ConfirmOrderView, { model }));
    expect(html.match(/Replenish Warehouse/g)).toHaveLength(1);
  });

  it("shows no shortage message when every line is covered", async () => {
    const { toConfirmOrderViewProps } = await import("../lib/mgr/confirm-order-view");
    const { orderSubmittedRidgeline: base } = await import("../lib/mgr/fixtures/orders");
    expect(toConfirmOrderViewProps({ ...base, lines: [base.lines[0]] }).shortageNote).toBeNull();
  });
});

describe("Work kind strip (#992)", () => {
  const WORK_VIEWS = ["orders-list", "transfers", "batches", "packaging-runs", "purchase-orders", "routes"];
  it("every Work page draws the kind strip through WorkKindTabs, not its own TabBar", () => {
    for (const view of WORK_VIEWS) {
      const source = readFileSync(`components/mgr/views/${view}.tsx`, "utf8");
      expect(source, view).toMatch(/<WorkKindTabs\b/);
      expect(source, view).not.toMatch(/E\.tabs\(WORK_CHIPS|<TabBar[^>]*workTabs/);
    }
  });
  it("Orders draws the kind strip full width with the state filter on its own row", () => {
    const html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Orders")!.body));
    const lists = [...html.matchAll(/<div[^>]*role="tablist"[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    expect(lists[0]).toContain("w-full overflow-x-auto");
    // Scrolls from its first tab and fades at a hidden edge (#1037).
    expect(lists[0]).toContain("justify-start scroll-cue");
    // The fade only exists where scroll timelines do; elsewhere a 0s animation would mask the strip.
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@utility scroll-cue \{\s*scroll-padding-inline: 2rem;\s*@supports \(animation-timeline: scroll\(\)\) \{\s*animation: scroll-cue/);
    expect(lists[0]).not.toContain("md:w-fit");
  });
});

describe("Invoice payments recorded in MGR (#1045)", () => {
  const by = (name: string) => SCREENS.find((s) => s.name === name);
  it("Invoice writes both payment commands and opens their sheets", () => {
    const invoice = by("Invoice")!;
    expect(String(invoice.writes)).toContain("record_invoice_payment · void_invoice_payment");
    expect(invoice.to).toMatchObject({ "Record payment": "Record payment", Void: "Void payment" });
    expect(invoice.states?.map(([label]) => label)).toEqual(expect.arrayContaining(["paid in MGR", "payments block push", "no payment due"]));
  });
  it("draws Record payment and Void payment as sheets over the shared fields", () => {
    for (const [name, verb] of [["Record payment", "Record payment"], ["Void payment", "Confirm void"]]) {
      expect(by(name)?.surface, name).toBe("sheet");
      expect(text(name), name).toContain(verb);
    }
    expect(text("Record payment")).toContain("This invoice will not be sent to QuickBooks while it has payments recorded in MGR.");
    expect(text("Void payment")).toContain("The $300.00 payment stays on the invoice");
  });
  it("says the balance and paid state also come from MGR's ledger", () => {
    expect(String(by("Invoice")!.spec)).toContain("the balance comes from QuickBooks, or from MGR's payment ledger for an invoice QuickBooks never received");
    expect(String(by("Payment")?.spec)).not.toContain("there is deliberately no Mark paid button anywhere in MGR");
  });
});

describe("Cancelled batch history (#1304)", () => {
  const planned: BrewDayViewModel = {
    title: "B-0001", planned: "0.5 bbl · Oct 15, 2026", vesselId: "",
    initialBbl: "0.5", brewedOn: "2026-10-15", vessels: [],
  };

  it("labels a cancelled header from its status without losing its planned facts", () => {
    const html = renderToStaticMarkup(createElement(BrewDayView, { model: { ...planned, cancelled: true } }));
    expect(html).toMatch(/>Cancelled<\/[^>]+>[\s\S]*0\.5 bbl · Oct 15, 2026/);
    expect(html).not.toMatch(/>Planned</);
    expect(html).toContain("This plan remains in history");
    expect(html).not.toContain("Record brew day");
    expect(html).not.toContain("Confirm actual ingredients");
  });

  it("keeps an uncancelled plan labelled Planned and available to record", () => {
    const html = renderToStaticMarkup(createElement(BrewDayView, { model: planned }));
    expect(html).toMatch(/>Planned</);
    expect(html).not.toMatch(/>Cancelled</);
    expect(html).toContain("Record brew day");
  });

  it("collapses cancelled history without removing links or inventing a brand or recipe", () => {
    const batch = { id: "cancelled", batch_no: 1, planned_on: "2026-10-15", planned_bbl: 0.5, brewed_on: null, closed_at: null, cancelled_at: "2026-10-16T12:00:00Z", brand_name: null, recipe_name: null, vessel_name: null, active_occupancies: [] };
    const model = toBatchesViewProps(batchesFromQuery([batch, { ...batch, id: "planned", batch_no: 2, cancelled_at: null }], [], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}` }));
    expect(model.cancelled?.[0]).toMatchObject({ brand: null, recipe: null });
    const html = renderToStaticMarkup(createElement(BatchesView, { model }));
    const history = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(history).toBeDefined();
    expect(history).not.toMatch(/<details[^>]*\bopen/);
    expect(history).toContain("Cancelled (1)");
    expect(history).toContain('href="/batches/cancelled"');
    expect(history).toContain("No brand yet");
    expect(history).toContain("No recipe");
    expect(history).not.toContain('href="/batches/planned"');
    expect(history).not.toMatch(/>Brew</);
    expect(html.slice(0, html.indexOf("<details"))).toContain('href="/batches/planned"');
    const cancelledOnly = renderToStaticMarkup(createElement(BatchesView, { model: { ...model, planned: [] } }));
    expect(cancelledOnly).toContain("Cancelled (1)");
    expect(cancelledOnly).not.toContain("No batches yet");
  });

  it("does not offer an empty Cancelled section", () => {
    const html = renderToStaticMarkup(createElement(BatchesView, { model: toBatchesViewProps({ title: "Batches", planned: [], active: [] }) }));
    expect(html).not.toContain("<details");
    expect(html).toContain("No batches yet");
  });
});
