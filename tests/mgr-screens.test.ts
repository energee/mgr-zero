// tests/mgr-screens.test.ts — the screen inventory is a typed record set:
// every record carries its metadata, `states` is a caption (never rendered
// into the body), and each body renders through the E vocabulary without
// throwing. Rendering uses react-dom/server, so no DOM is needed.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";

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
      for (const [label, text] of s.states ?? []) {
        expect(html).not.toContain(text);
        void label;
      }
    }
  });

  it("keeps the exemplar on Today", () => {
    expect(SCREENS.filter((s) => s.ex).map((s) => s.name)).toEqual(["Today"]);
  });
});
