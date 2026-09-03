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
    // Bump it deliberately when a frame lands; .agents/PROGRESS.md narrates
    // what the number is made of — 153 MGR frames plus the 17 venue frames.
    expect(SCREENS).toHaveLength(170);
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
      for (const [, link] of html.matchAll(/<a [^>]*>(.*?)<\/a>/g)) {
        const target = link.replace(/<[^>]*>/g, "");
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

  it("marks pickable fields and never pins Required on a filled one", () => {
    const chevrons = new Map([
      ["Create brewery", 1], ["Record movement", 4], ["Composer proposal", 3],
      ["Return and credit", 1], ["New order", 4], ["Cellar addition", 2],
      ["Brew day", 3], ["Schedule batch", 2], ["Cellar transfer", 2], ["Close packaging run", 2],
      ["Schedule packaging run", 2], ["Cycle count", 1], ["Chat settings", 3],
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

  it("pins the keypad commit so the pad does not push it off the phone", () => {
    // Issue 73: on a 390×900 sheet the pad sat above the verb, so Record
    // landed below the fold. The pin is a data-pin footer; CommandForm lifts
    // it out of the scroll region.
    const named = [
      "Record movement", "Fermentation reading", "Cellar addition",
      "Cellar transfer", "Cycle count", "Repack",
    ];
    for (const name of named) {
      const s = SCREENS.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      const { pin } = splitPinned(s!.body);
      expect(pin.length, `${name}: pin lifted`).toBe(1);
      const pinHtml = renderToStaticMarkup(createElement("div", null, pin));
      expect(pinHtml, `${name}: pad inside pin`).toContain("⌫");
      expect(pinHtml, `${name}: commit verb inside pin`).toMatch(/Record (movement|reading|addition|transfer|count|repack)/);
    }
    const reading = SCREENS.find((x) => x.name === "Fermentation reading")!;
    const readingHtml = renderToStaticMarkup(createElement("div", null, reading.body));
    expect(readingHtml).toMatch(/Gravity[\s\S]*on pad/);
    const transfer = SCREENS.find((x) => x.name === "Cellar transfer")!;
    const transferHtml = renderToStaticMarkup(createElement("div", null, transfer.body));
    expect(transferHtml).not.toMatch(/border-l-2/);
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

  it("gives the named screens one filled primary each", () => {
    // Issue 71: two filled verbs on one body fight for the commit. Outline,
    // ghost, disabled, pad keys and steppers are not the primary. A tile or
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
