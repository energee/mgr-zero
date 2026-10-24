// tests/work-tab-scroll.test.ts — #1129: at phone width the Work kind strip
// scrolls, so the page's own tab can start off-screen. `nearestScroll` says how
// far to scroll the strip, and only the strip, to show that tab clear of the
// scroll-cue fade. The numbers are the strip measured at 390px on /routes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nearestScroll } from "../components/mgr/views/work-kind-tabs";

const strip = { left: 19, right: 371 };

describe("nearestScroll", () => {
  it("scrolls right to show a tab past the right edge, clear of the fade", () => {
    // Deliveries at 451–529: 158px past the edge, plus the 32px padding.
    expect(nearestScroll(strip, { left: 451, right: 529 }, 32)).toBe(190);
  });

  it("scrolls left to show a tab before the left edge", () => {
    expect(nearestScroll(strip, { left: -50, right: 10 }, 32)).toBe(-101);
  });

  it("leaves a tab that is already in view where it is", () => {
    expect(nearestScroll(strip, { left: 60, right: 120 }, 32)).toBe(0);
  });
});

it("keeps the shared Work strips horizontal without native scrollbar steppers (#1129)", () => {
  const css = readFileSync("app/globals.css", "utf8").split("@utility scroll-cue {")[1]?.split("@keyframes scroll-cue")[0];
  expect(css).toContain("overflow-y: hidden;");
  expect(css).toContain("scrollbar-width: none;");
  for (const view of ["work", "work-kind-tabs"]) {
    const source = readFileSync(`components/mgr/views/${view}.tsx`, "utf8");
    expect(source).toContain("overflow-x-auto justify-start scroll-cue");
  }
});
