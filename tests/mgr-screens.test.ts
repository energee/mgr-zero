// tests/mgr-screens.test.ts — the screen inventory (the source of truth for
// MGR screens) is a typed record set:
// every record carries its metadata, `states` is a caption (never rendered
// into the body), and each body renders through the E vocabulary without
// throwing. Rendering uses react-dom/server, so no DOM is needed.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SCREENS, type Screen } from "../components/mgr/screens";
import { E, splitPinned } from "../components/mgr/e";
import { VenueFrame } from "../components/mgr/venue";
import { AppShell } from "../components/mgr/app-shell";

describe("SCREENS", () => {
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
      if (s.states) expect(html).not.toContain(renderToStaticMarkup(E.states(s.states)));
    }
  });

  it("carries every MGR-venue frame with unique names", () => {
    // A tripwire against a frame dropped by hand from a 1700-line array — the
    // uniqueness check below catches duplicates, nothing else catches a loss.
    // Bump it deliberately when a frame lands. 154 MGR frames plus the 17
    // venue frames; Today empty is the extra MGR frame from issue 97.
    expect(SCREENS).toHaveLength(171);
    expect(new Set(SCREENS.map((s) => s.name)).size).toBe(SCREENS.length);
  });

  it("draws connection recovery and confirmation surfaces", () => {
    const expected = new Map<string, Screen["surface"]>([
      ["Connect QuickBooks", undefined], ["Mapping conflict", "sheet"], ["Disconnect QuickBooks", "sheet"],
      ["Connect Square", undefined], ["Square locations", "sheet"], ["Square → QuickBooks connector", "sheet"], ["Disconnect Square", "sheet"],
      ["Linked people", undefined], ["Link your Slack", "entry"], ["Disconnect Slack", "sheet"],
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
      ["Locations", undefined], ["Location detail", undefined], ["Materials", undefined],
      ["Material", "sheet"], ["Vendor", "sheet"], ["Contracts", undefined],
      ["Contract", "sheet"], ["SKU list", undefined], ["Team member", "sheet"],
    ]);
    for (const [name, surface] of expected) {
      const screen = SCREENS.find((s) => s.name === name);
      expect.soft(screen, name).toBeTruthy();
      expect.soft(screen?.surface, name).toBe(surface);
    }
    const bodyText = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    for (const destination of ["Vendors", "Sale channels", "Formats", "Price tiers", "Bins", "Chat"]) {
      expect.soft(bodyText("More"), destination).toContain(destination);
    }
    expect(bodyText("Team")).not.toContain("Remove selected member");
    expect(bodyText("Import")).toContain("Settings");
    expect(bodyText("Planning")).toContain("More");
  });

  it("splits list pages from their row editors", () => {
    const sheets = ["Invite portal user", "Fix mapping", "Package BOM", "SKU", "Brand approval", "State registration", "License", "Channel", "Format", "Override", "Bin"];
    for (const name of sheets) expect.soft(SCREENS.find((s) => s.name === name)?.surface, name).toBe("sheet");
    expect(SCREENS.find((s) => s.name === "Invoice")?.surface).toBeUndefined();
    for (const name of ["Customers", "Invoices", "Catalog", "Vendors", "Compliance registry", "Sale channels", "Formats", "Price tiers", "Location bins"]) {
      const html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
      expect.soft(html, `${name}: inline save`).not.toMatch(/>Save[^<]*<\/button>/);
    }
    const product = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Product")!.body));
    expect(product).not.toContain("Save SKU");
  });

  it("lets portal buyers type quantities in both order steps", () => {
    const html = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    expect(html("Shop").match(/<input[^>]*type="number"/g)).toHaveLength(3);
    for (const value of [4, 6, 0]) expect(html("Shop")).toContain(`value="${value}"`);
    expect(html("Review order").match(/<input[^>]*type="number"/g)).toHaveLength(2);
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
      "Add", "Add stop", "Add to route", "Adjust", "Assign", "Change", "Check", "Choose who gets it", "Close", "Confirm", "Connect", "Count", "Create",
      "Disconnect", "Edit", "Edit prices", "Finish", "Fix", "Invite", "Kick", "Map", "Open", "Open balance", "Open batch", "Open count",
      "Open in QuickBooks", "Open mapping", "Pay", "Pick", "Pick source", "Put back", "Reading", "Receive", "Record opening count", "Release", "Reload", "Remove", "Reorder", "Re-push",
      "Resolve", "Resume", "Retry", "Review", "Review history", "Review sales", "Select", "Send", "Send PO", "Shortfall", "Skip", "Start", "Swap", "Switch", "Tap",
      "Unlink", "Use", "Write off", "Fix registration", "Forgot password?", "Import CSV",
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
        const target = tag.match(/data-to="([^"]*)"/)?.[1] ?? link.replace(/<[^>]*>/g, "");
        expect.soft(
          screenNames.has(target) || shellDestinations.has(target) || /^[A-Z]{2,3}-\d+$/.test(target),
          `${s.name}: unresolved back target ${target}`,
        ).toBe(true);
      }
    }
  });

  it("threads one invoice through the AR, portal and venue frames", () => {
    const names = [
      "Invoice drift", "Invoices", "Review order", "Order history",
      "Pay invoice", "Payment unavailable", "Invoice history",
      "Pushed invoice", "Payment", "Credit memo",
    ];
    for (const s of SCREENS.filter((s) => names.includes(s.name))) {
      const text = renderToStaticMarkup(createElement("div", null, s.body)).replace(/<[^>]*>/g, " ");
      expect.soft(text, s.name).toContain("948");
      expect.soft(text, s.name).not.toMatch(/1,051|1,240|\b185\.00|\b740\.00|\b252\.00|\b114\.00/);
    }
    const pushed = SCREENS.find((s) => s.name === "Pushed invoice")!;
    const venue = renderToStaticMarkup(VenueFrame({ venue: pushed.venue!, children: pushed.body }));
    expect(venue).toContain("9/3/26");
    expect(venue).not.toContain("9/11/26");
    const tier = SCREENS.find((s) => s.name === "Price tiers")!;
    const tierText = renderToStaticMarkup(createElement("div", null, tier.body)).replace(/<[^>]*>/g, " ");
    expect(tierText).toContain("$150.00");
    expect(tierText).not.toContain("$185.00");
    const history = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Invoice history")!.body));
    expect(history.match(/INV-1042/g)).toHaveLength(1);
    expect(history).not.toContain("INV-0198");
    expect(history).toContain("Pay");
  });

  it("gives Save screens a real input or select", () => {
    // Issue 95: a Save button that would write a value must sit next to a
    // typed Input or a Select, not a read-only key/value row.
    for (const screen of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, screen.body));
      if (!/<button[^>]*>Save/.test(html)) continue;
      expect.soft(
        /<input\b/.test(html) || html.includes('role="combobox"'),
        `${screen.name}: Save without an input or select`,
      ).toBe(true);
    }
  });

  it("marks pickable fields and never pins Required on a filled one", () => {
    const chevrons = new Map([
      ["Record movement", 1], ["Composer proposal", 1], ["Cellar addition", 1],
      ["Brew day", 3], ["Schedule packaging run", 1], ["Cycle count", 1],
      ["Chat settings", 2], ["Package BOM", 1], ["POS mapping", 4],
    ]);
    for (const s of SCREENS.filter((s) => !s.venue)) {
      const html = renderToStaticMarkup(createElement("div", null, s.body));
      expect.soft(html, `${s.name}: Required pill`).not.toMatch(/<button[^>]*>Required<\/button>/);
      if (chevrons.has(s.name)) {
        expect.soft(html.match(/>›</g)?.length ?? 0, `${s.name}: picker affordances`).toBeGreaterThanOrEqual(chevrons.get(s.name)!);
      }
    }
  });

  it("draws customer copy, not markup escapes, machine identifiers or em dashes", () => {
    // Bodies are what a brewer reads on the glass; job, states and spec are
    // what a reader sees on /docs/screens. A literal "&frac12;" is a string
    // React never decodes, "record_movement" is the wire name of a command, not
    // its label, and an em dash is a tell that a sentence was never finished.
    // reads/writes are exempt from the identifier rule only: they name
    // registry IDs on purpose.
    const text = (...n: unknown[]) =>
      n.map((x) => renderToStaticMarkup(createElement("div", null, x as never)).replace(/<[^>]*>/g, " ")).join(" ");
    for (const s of SCREENS) {
      const body = text(s.hd, s.body);
      const notes = text(s.job, s.spec, ...(s.states ?? []).flat());
      expect.soft(body, `${s.name}: HTML entity in copy`).not.toMatch(/&(?:[a-z]+|#\d+);/);
      expect.soft(body + notes, `${s.name}: snake_case or dotted identifier`).not.toMatch(/[a-z]+_[a-z_]+|\b[a-z]+\.[a-z]+_[a-z_]+|\b[a-z]+\.[a-z_]+\(/);
      expect.soft(body + notes + text(s.reads, s.writes), `${s.name}: em dash`).not.toContain("—");
    }
  });

  it("keeps phone tables contained and avoids duplicate page titles", () => {
    const menu = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Menu")!.body));
    const pos = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Point of sale")!.body));
    const formats = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Formats")!.body));
    expect(menu.match(/<h[12][^>]*>[^<]*(?:POS )?menu/gi)).toHaveLength(1);
    expect(pos.match(/<h[12][^>]*>Point of sale/gi)).toHaveLength(1);
    expect(menu + formats).toContain("min-w-max");
    const slack = SCREENS.find((s) => s.name === "Notification preferences")!;
    expect(renderToStaticMarkup(VenueFrame({ venue: slack.venue!, children: slack.body }))).toContain('class="slk modal"');
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
      expect(pinHtml, `${name}: commit verb inside pin`).toMatch(/Record (movement|reading|addition|transfer|count|repack)/);
    }
    const transfer = SCREENS.find((x) => x.name === "Cellar transfer")!;
    const transferHtml = renderToStaticMarkup(createElement("div", null, transfer.body));
    expect(transferHtml).not.toMatch(/border-l-2/);
  });

  it("puts the commit on the row, not a second copy at the top", () => {
    // Issue 97: Today-family top buttons duplicated the row verb; Order had
    // Adjust line plus trailing adjust; Confirm order said Next: confirm twice.
    const html = (name: string) => renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    expect(html("Today")).not.toMatch(/Pick · 3 ready/);
    expect(html("Today")).toMatch(/data-row-action[^>]*>Pick</);
    expect(html("Sales")).not.toMatch(/<button[^>]*>New order</);
    expect(html("Sales")).toMatch(/New order/);
    expect(html("Brewer")).not.toMatch(/grid-cols-2/);
    expect(html("Taproom")).not.toMatch(/<button[^>]*>Swap keg</);
    expect(html("Taproom")).toMatch(/data-row-action[^>]*>Swap</);
    expect(html("Driver")).toMatch(/Resume/);
    expect(html("Order")).not.toMatch(/Adjust line/);
    expect(html("Order")).toMatch(/>Add line</);
    expect(html("Order").match(/data-row-action[^>]*>Adjust</g)).toHaveLength(3);
    expect(html("Confirm order")).toMatch(/Submitted · ships Thu/);
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
    for (const name of ["No membership", "Expired invite", "Expired reset", "Session expired", "Composer question"]) {
      expect(SCREENS.some((s) => s.name === name), name).toBe(true);
    }
    const q = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Composer question")!.body));
    expect(q).not.toMatch(/Commit/);
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
    expect(pickSheet).toMatch(/›/);
    expect(pickSheet).toMatch(/Thu/);
    const pick = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Pick")!.body));
    expect(pick).toMatch(/Print/);
    const deliveryStatus = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Confirm delivery")!.body));
    expect(deliveryStatus).not.toContain(">›<");
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
    for (const name of ["Shipment done", "Run closed", "Receipt", "Movement recorded"]) {
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
    expect(shopHtml).toMatch(/p disabled|disabled/);
    expect(shopHtml).toMatch(/ship from/i);
    const history = SCREENS.find((s) => s.name === "Order history")!;
    const historyHtml = renderToStaticMarkup(createElement("div", null, history.body));
    expect(historyHtml).toMatch(/Reorder/);
  });

  it("puts a stepper on quantity rows and leaves reason unchosen", () => {
    // Issue 75: quantities were static text. Pick had no way to change a
    // count. Short pick and Ship and invoice preselected a reason.
    const qty = [
      "Pick", "Receive PO", "Return and credit", "New order",
      "Weekly count", "Schedule packaging run",
    ];
    for (const name of qty) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const html = renderToStaticMarkup(createElement("div", null, s!.body));
      expect(html, name).toMatch(/aria-label="Decrease"/);
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

  it("uses the desktop width instead of a centred phone column (#98)", () => {
    // Issue 98: the shell was capped at a phone column, buttons kept a fixed
    // grid and tiles were locked to three, so desktop drew wide gutters.
    // children in the props object keeps this a plain createElement call in a
    // .ts test; the lint rule only allows it away from a literal.
    const shellProps = { brand: "Demo", items: [], active: "Today", children: "body" };
    const shell = renderToStaticMarkup(createElement(AppShell, shellProps));
    expect(shell).toContain("md:max-w-5xl");
    expect(shell).not.toContain("md:max-w-2xl");
    const btns = renderToStaticMarkup(E.btns([["Save", "p"], ["Cancel", "g"], ["Third", "g"]], "c3"));
    expect(btns).toContain("md:flex");
    expect(btns).not.toContain("md:grid-cols-3");
    const tiles = renderToStaticMarkup(E.tiles([["FV1", "Pils"], ["FV2", "Hazy"]]));
    expect(tiles).toContain("auto-fill");
  });

  it("uses the control that does the job on view switchers and roles (#99)", () => {
    // Issue 99: filter chips were standing in for view switchers, a
    // one-option chip group, a link and a role editor.
    const html = (name: string) =>
      renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
    for (const name of ["Compliance registry", "Chat settings", "Menu", "Tap board", "Variance by brand"]) {
      expect(html(name), name).toContain("tablist");
    }
    // Record movement: seven kinds are a Select on the phone, chips from md up.
    const move = html("Record movement");
    expect(move).toContain("md:hidden");
    expect(move).toContain("hidden md:block");
    // Team: no selection-less bulk remove; the role Select lives on the
    // Team member sheet since #72 split editors out of list pages.
    expect(html("Team")).not.toMatch(/Remove selected member/);
    expect(html("Team member")).toContain("data-slot=\"select-trigger\"");
    // Sign in: a link, not a card row.
    expect(html("Sign in")).toMatch(/<a [^>]*>Forgot password\?<\/a>/);
    // Product: no one-option chip group.
    const product = SCREENS.find((s) => s.name === "Product")!;
    expect(renderToStaticMarkup(createElement("div", null, product.body))).not.toContain("tax class");
    expect(JSON.stringify(product.states)).toMatch(/tax class/);
    // Dates are native date inputs.
    expect(html("New order")).toMatch(/type="date"/);
    expect(html("Receive PO")).toMatch(/type="date"/);
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
      "Weekly count", "Brew day", "Route", "Settings", "Product", "Vendors",
      "POS mapping", "Planning", "Schedule batch", "Vessel detail", "Kick keg", "Return route",
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
      expect(filled(html).length, name).toBeLessThanOrEqual(1);
    }
  });
});
