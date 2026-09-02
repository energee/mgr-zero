// tests/mgr-screens.test.ts — the screen inventory is a typed record set:
// every record carries its metadata, `states` is a caption (never rendered
// into the body), and each body renders through the E vocabulary without
// throwing. Rendering uses react-dom/server, so no DOM is needed.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { E } from "../components/mgr/e";

describe("SCREENS", () => {
  it("ports the eleven step-1 frames with names, jobs and IO", () => {
    const step1 = SCREENS.filter((s) => s.step === 1);
    expect(step1.map((s) => s.name)).toEqual([
      "Today", "Today · sales", "Today · brewer", "Today · driver", "Today · taproom",
      "Beer", "Work", "More", "Global search", "Me", "Settings",
    ]);
    for (const s of SCREENS) {
      expect(s.job).toBeTruthy();
      expect(s.reads).toBeTruthy();
      expect(s.writes).toBeTruthy();
      expect(Boolean(s.tab) || Boolean(s.group) || Boolean(s.portal)).toBe(true);
    }
  });

  it("renders every body, and keeps states out of the markup", () => {
    for (const s of SCREENS) {
      const html = renderToStaticMarkup(createElement("div", null, s.hd, s.body));
      expect(html.length).toBeGreaterThan(50);
      if (s.states) expect(html).not.toContain(renderToStaticMarkup(E.states(s.states)));
    }
  });

  it("carries every MGR-venue wireframe frame (94 minus the 17 Slack/QuickBooks/Square ones) with unique names", () => {
    expect(SCREENS).toHaveLength(77);
    expect(new Set(SCREENS.map((s) => s.name)).size).toBe(SCREENS.length);
  });

  it("keeps the exemplar on Today", () => {
    expect(SCREENS.filter((s) => s.ex).map((s) => s.name)).toEqual(["Today"]);
  });
});
