// tests/first-run.test.ts — when Today shows the First-run checklist (#1511)
// and how a finished step reads.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FirstRunChecklist, showFirstRun, type FirstRun } from "../app/(app)/first-run";

const none: FirstRun = { hasLocation: false, hasBrand: false, hasMovement: false, hasStaff: false };

it("showFirstRun stays open until a location and a brand both exist, not waiting on staff or opening stock", () => {
  expect(showFirstRun(none)).toBe(true);
  expect(showFirstRun({ ...none, hasLocation: true })).toBe(true);
  expect(showFirstRun({ ...none, hasBrand: true })).toBe(true);
  expect(showFirstRun({ ...none, hasLocation: true, hasBrand: true })).toBe(false);
});

it("labels a finished step Done", () => {
  const html = renderToStaticMarkup(createElement(FirstRunChecklist, { brewery: "Demo", state: { hasLocation: true, hasBrand: true, hasMovement: true, hasStaff: true } }));
  expect(html).toContain("Done");
  expect(html).not.toMatch(/>done</);
});
