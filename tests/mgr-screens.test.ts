// tests/mgr-screens.test.ts — the screen inventory (the source of truth for
// MGR screens) is a typed record set:
// every record carries its metadata, `states` is a caption (never rendered
// into the body), and each body renders through the E vocabulary without
// throwing. Rendering uses react-dom/server, so no DOM is needed.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { E } from "../components/mgr/e";
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
    // what the number is made of — 97 MGR frames plus the 17 venue frames.
    expect(SCREENS).toHaveLength(114);
    expect(new Set(SCREENS.map((s) => s.name)).size).toBe(SCREENS.length);
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
  });

  it("marks pickable fields and never pins Required on a filled one", () => {
    const chevrons = new Map([
      ["Create brewery", 1], ["Record movement", 4], ["Composer proposal", 3],
      ["Return and credit", 1], ["New order", 4], ["Cellar addition", 2],
      ["Brew day", 3], ["Schedule batch", 2], ["Cellar transfer", 2], ["Close packaging run", 3],
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

  it("gives sheets no separate header; their title is the record name", () => {
    expect(SCREENS.filter((s) => s.surface === "sheet" && s.hd)).toEqual([]);
  });

  it("gives the named screens one filled primary each", () => {
    // Issue 71: two filled verbs on one body fight for the commit. Outline,
    // ghost, disabled, pad keys and steppers are not the primary. A tile or
    // row act can still open the next screen.
    const named = [
      "Today", "Taproom", "Order", "Cellar map", "Tap board", "Swap keg",
      "Weekly count", "Brew day", "Route", "Settings", "Product", "Vendors",
      "POS mapping", "Planning", "Schedule batch", "Vessel", "Kick keg", "Return route",
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
