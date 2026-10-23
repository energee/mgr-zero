import { readFileSync } from "node:fs";
import { cloneElement, createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { FermentationScheduleView } from "@/components/mgr/views/fermentation-schedule";
import { MashScheduleView } from "@/components/mgr/views/mash-schedule";
import { WaterView } from "@/components/mgr/views/water";

it.each([
  ["Orders", "createAction", "New order"],
  ["Order", "footer", "Cancel order"],
  ["Confirm order", "footer", "Cancel order"],
  ["Complete transfer", "footer", "Complete transfer"],
  ["Put back", "footer", "Put back 3"],
  ["Pars and allocation", "footer", "Adjust selected"],
  ["Order detail", "footer", "Reorder"],
])("%s retains omitted fixture controls but suppresses an explicit null %s", (name, slot, label) => {
  const body = SCREENS.find(screen => screen.name === name)!.body as ReactElement<Record<string, unknown>>;
  const omitted = renderToStaticMarkup(cloneElement(body, { [slot]: undefined }));
  const suppressed = renderToStaticMarkup(cloneElement(body, { [slot]: null }));
  const button = new RegExp(`<button[^>]*>${label}</button>`);
  expect(omitted).toMatch(button);
  expect(suppressed).not.toMatch(button);
  if (name === "Order") expect(suppressed).not.toContain("Cancel asks you to confirm");
});

it("explicit null invoice question and QBO slots suppress their fixture actions", () => {
  const body = SCREENS.find(screen => screen.name === "Invoice")!.body as ReactElement<Record<string, unknown>>;
  const html = renderToStaticMarkup(cloneElement(body, { questionAction: null, qbo: null, qboGate: "not connected" }));
  expect(html).not.toContain("Mark answered");
  expect(html).not.toContain("not connected");
  expect(html).not.toMatch(/>Fix</);
});

// Task 11 (QW18-21): the schedule views take a whole-header `header` slot and draw tappable rows.
const STEPS = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "mash-out", tempF: 168, minutes: 10 },
];
const STAGES = [{ name: "Primary", kind: "primary", tempF: 68, days: 4 }, { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 }];
const WATER = { targetProfileId: "", sourceProfileId: "", mashGal: "", spargeGal: "", targetMashPh: "", additions: [] };
const verbs = { onEdit: () => {}, onMove: () => {} };
const headerOf = {
  "Mash schedule": (header?: ReactNode) => createElement(MashScheduleView, { steps: STEPS, header }),
  "Fermentation schedule": (header?: ReactNode) => createElement(FermentationScheduleView, { stages: STAGES, header }),
  Water: (header?: ReactNode) => createElement(WaterView, { water: WATER, profiles: [], materials: [], header }),
};

it.each(Object.entries(headerOf))("%s draws its own header, none for header={null}, and a passed node in its place", (title, view) => {
  expect(renderToStaticMarkup(view())).toContain(`<h1 class="text-lg font-semibold">${title}</h1>`);
  const suppressed = renderToStaticMarkup(view(null));
  expect(suppressed).not.toContain("<h1");
  expect(suppressed).not.toContain(">Recipe<");
  const replaced = renderToStaticMarkup(view(createElement("b", null, "ADD")));
  expect(replaced).toContain("<b>ADD</b>");
  expect(replaced).not.toContain("<h1");
});

it("a live schedule row names its arrows and its Edit after the row, and mash rows drop a kind that repeats the name", () => {
  const html = renderToStaticMarkup(createElement(MashScheduleView, { steps: STEPS, ...verbs }));
  expect(html).toContain('aria-label="Move Saccharification up"');
  expect(html).toContain('aria-label="Move Saccharification down"');
  expect(html).toMatch(/data-row-index="1"/);
  expect(html).toContain('Edit<span class="sr-only"> Saccharification</span>');
  expect(html).not.toContain('aria-label="Move Mash-in up"');
  expect(html).not.toContain('aria-label="Move Mash-out down"');
  expect(html).toContain("Infusion · 152 °F · 60 min");
  expect(html).not.toContain("mash-out · 168");
});

// Task 12 (QW21): after a move, focus stays on the moved row; the ingredient Edit carries its row name.
it("ListSheet puts focus back on the moved row through data-row-index, and the ingredient Edit names its row", () => {
  const html = renderToStaticMarkup(createElement(MashScheduleView, { steps: STEPS, ...verbs }));
  expect(html).toMatch(/<div data-row-index="1">/);
  expect(html).toContain('data-move="-1"');
  const sheet = readFileSync("app/(app)/recipes/[id]/schedule-sheets.tsx", "utf8");
  expect(sheet).toMatch(/requestAnimationFrame\(/);
  expect(sheet).toContain("[data-row-index=");
  expect(sheet).toMatch(/\[data-move=.*\[data-row-action\]|\[data-row-action\][\s\S]*\[data-move=/);
  const form = readFileSync("app/(app)/recipes/[id]/recipe-version-form.tsx", "utf8");
  expect(form).toContain('E.act(<>Edit<span className="sr-only"> {material.name(l.materialId)}</span></>)');
});
