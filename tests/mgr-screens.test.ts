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

describe("SCREENS", () => {
  it("ports the step-1 frames with names, jobs and IO", () => {
    const step1 = SCREENS.filter((s) => s.step === 1);
    expect(step1.map((s) => s.name)).toEqual([
      "Today", "Today · sales", "Today · brewer", "Today · driver", "Today · taproom",
      "Beer", "Work", "More", "Global search", "Me", "Settings", "Permission denied",
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

  it("carries every MGR-venue frame with unique names", () => {
    // 77 ported from the wireframes (94 minus the 17 Slack/QuickBooks/Square
    // venue drawings) + Permission denied (plan §3) + the five revision-2
    // frames (schema §16), which are drawn gated until §16 is migrated.
    expect(SCREENS).toHaveLength(83);
    expect(new Set(SCREENS.map((s) => s.name)).size).toBe(SCREENS.length);
  });

  it("gives sheets no separate header; their title is the record name", () => {
    expect(SCREENS.filter((s) => s.surface === "sheet" && s.hd)).toEqual([]);
  });
});
