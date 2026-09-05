// tests/design-docs.test.ts — the screen inventory is published as a Fumadocs
// page that renders components/mgr/screens.tsx directly, so it cannot drift
// from the code, and it stays outside the documentation agent's allowlist:
// the customer guides are agent-maintained, this page is generated from code.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ScreenIndex } from "../components/mgr/screen-index";
import { area, SCREENS } from "../components/mgr/screens";

describe("design docs", () => {
  it("publishes both pages in the Fumadocs tree", () => {
    const meta = JSON.parse(readFileSync("content/docs/meta.json", "utf8"));
    expect(meta.pages).toEqual(expect.arrayContaining(["screens", "integrations"]));
    expect(readFileSync("content/docs/screens.mdx", "utf8")).toContain("<ScreenIndex />");
    expect(readFileSync("content/docs/integrations.mdx", "utf8")).toContain('<ScreenIndex kind="venues" />');
  });

  it("splits MGR screens from the external venues, losing none", () => {
    const mgr = renderToStaticMarkup(createElement(ScreenIndex));
    const venues = renderToStaticMarkup(createElement(ScreenIndex, { kind: "venues" as const }));
    for (const s of SCREENS) {
      const [inPage, other] = s.venue ? [venues, mgr] : [mgr, venues];
      expect(inPage, `${s.name} is missing from its page`).toContain(s.name);
      expect(other, `${s.name} appears on both pages`).not.toContain(`>${s.name}<`);
    }
    // Venues group by product, not by the tab a record happens to carry.
    for (const product of ["QuickBooks", "Square", "Slack"]) expect(venues).toContain(product);
  });

  it("stays out of the documentation agent's reach", () => {
    // .github/workflows/documentation-agent.yml allowlists three guides and
    // fails the run on any other path; a generated page must not be editable.
    const wf = readFileSync(".github/workflows/documentation-agent.yml", "utf8");
    expect(wf).not.toContain("screens.mdx");
  });
});

// The explorer (content/docs/screens-explore.mdx) is the same inventory as a
// browse-and-filter page; the filter is a pure function so it is tested here.
describe("screen explorer", () => {
  it("publishes the explore page beside the inventory", () => {
    const meta = JSON.parse(readFileSync("content/docs/meta.json", "utf8"));
    expect(meta.pages.indexOf("screens-explore")).toBe(meta.pages.indexOf("screens") + 1);
    expect(readFileSync("content/docs/screens-explore.mdx", "utf8")).toContain("<ScreenExplorer />");
  });

  it("filters MGR screens by text, area and surface, never venues", async () => {
    const { filterScreens, screenByName } = await import("../lib/mgr/screen-explorer");
    const all = filterScreens({});
    expect(all.length).toBe(SCREENS.filter((s) => !s.venue).length);
    expect(all.every(([, s]) => !s.venue)).toBe(true);
    // Text matches the name, case-insensitive; the index is the frame route key.
    const orders = filterScreens({ q: "orders" });
    expect(orders.map(([, s]) => s.name)).toContain("Orders");
    for (const [i, s] of orders) expect(SCREENS[i]).toBe(s);
    expect(filterScreens({ area: "Work" }).every(([, s]) => area(s) === "Work")).toBe(true);
    expect(filterScreens({ surface: "sheet" }).every(([, s]) => s.surface === "sheet")).toBe(true);
    expect(filterScreens({ surface: "page" }).every(([, s]) => !s.surface)).toBe(true);
    expect(filterScreens({ q: "no such screen" })).toEqual([]);
    expect(screenByName("Orders")?.[1].name).toBe("Orders");
    expect(screenByName("Nope")).toBeUndefined();
  });

  it("finds the page a sheet opens over: the last page visited, else its area's first page", async () => {
    const { pageUnder, screenByName } = await import("../lib/mgr/screen-explorer");
    const orders = screenByName("Orders")![0];
    const movement = screenByName("Record movement")![0];
    const run = screenByName("Schedule packaging run")![0];
    const today = screenByName("Today")![0];
    expect(pageUnder([today, orders, movement], movement)).toBe(orders);
    // No trail: the first page in the sheet's own area.
    expect(SCREENS[pageUnder([], run)].surface).toBeUndefined();
    expect(area(SCREENS[pageUnder([], run)])).toBe(area(SCREENS[run]));
    // A page is its own ground.
    expect(pageUnder([today], orders)).toBe(orders);
    // Global is anywhere: its sheets open over Today, never over the refusal
    // page that happens to lead the area.
    expect(pageUnder([], screenByName("Search")![0])).toBe(today);
    expect(pageUnder([], movement)).toBe(today);
  });
});

describe("explorer search and link state", () => {
  it("matches a screen by its job, spec and state notes, not only its name", async () => {
    const { filterScreens } = await import("../lib/mgr/screen-explorer");
    const names = (q: string) => filterScreens({ q }).map(([, s]) => s.name);
    expect(names("credit")).toContain("Return and credit");
    expect(names("blocking review")).toContain("Confirm order"); // spec text
    expect(names("skeleton")).toContain("Confirm order"); // a state note
    expect(names("zzzz-nothing")).toEqual([]);
  });

  it("round-trips the explorer state through the hash and reads the old #s<index> form", async () => {
    const { parseHash, buildHash } = await import("../lib/mgr/screen-explorer");
    expect(parseHash("#s7")).toEqual({ s: 7 });
    expect(parseHash("")).toEqual({});
    const state = { s: 12, p: "sales", q: "keg", a: "Work", f: "sheet" };
    expect(parseHash(buildHash(state))).toEqual(state);
    expect(buildHash({ s: 3 })).toBe("#s=3");
    expect(parseHash("#s=3&p=brewer")).toEqual({ s: 3, p: "brewer" });
  });
});
