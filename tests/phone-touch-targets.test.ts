// tests/phone-touch-targets.test.ts — the phone audit's shared fixes. Under a
// coarse pointer every button is 48px even when a sheet, dialog or pagination
// wrapper renames its data-slot; tab strips and fold-out lines get the same
// floor; small text links (the back arrow, a tile's Add reading) get a 48px hit
// area; and the reading sheet opens ready to type, stacks its actions, and
// lets a negative °P be typed.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FermentationReadingView } from "@/components/mgr/views/fermentation-reading";
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { toCellarMapViewProps } from "@/lib/mgr/cellar-map-view";
import { E, TOUCH_HIT } from "@/components/mgr/e";

describe("coarse-pointer sizing in app/globals.css", () => {
  const coarse = readFileSync("app/globals.css", "utf8").split("@media (pointer: coarse) {")[1]?.split("\n}\n")[0] ?? "";
  it("sizes buttons by their class, which a trigger wrapper cannot rename", () => {
    expect(coarse).toContain(".group\\/button,");
    expect(coarse).toContain('.group\\/button[data-size^="icon"]');
    expect(coarse).toContain('.group\\/button[data-variant="default"]');
    expect(coarse).not.toContain('[data-slot="button"]');
  });
  it("gives tab strips and fold-out lines the same 48px floor", () => {
    expect(coarse).toContain('[data-slot="tabs-list"]');
    expect(coarse).toContain("summary");
  });
});

describe("small text links get a 48px hit area", () => {
  it("on the back arrow of a detail page", () => {
    expect(renderToStaticMarkup(E.back("Beer", "Cellar"))).toContain(TOUCH_HIT);
  });
  it("on a cellar tile's Add reading", () => {
    const vessels = [{ id: "v1", name: "FV1", capacity_bbl: 10, kind: "fermenter" as const }];
    const occupied = [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, started_at: "2026-09-01T12:00:00Z", bbl: 2 }];
    const model = toCellarMapViewProps(vessels, occupied, {}, {}, (id) => `/cellar/${id}/reading`);
    const html = renderToStaticMarkup(createElement(CellarMapView, { model }));
    expect(html).toMatch(new RegExp(`<a[^>]*class="[^"]*${TOUCH_HIT}[^"]*"[^>]*>Add reading`));
  });
});

describe("the reading sheet on a phone", () => {
  const values = { observedAt: "2026-09-10T08:10:00", tempF: "", gravity: "", ph: "", note: "" };
  const view = (unit: "sg" | "plato", onChange?: () => void) =>
    renderToStaticMarkup(createElement(FermentationReadingView, { formId: "f", values, identity: { vessel: "FV3" }, unit, timeZone: "America/New_York", onChange }));
  const input = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

  it("keeps the decimal keypad for SG, and a keyboard with a minus key for °P", () => {
    expect(input(view("sg"), "fr-gravity")).toContain('inputMode="decimal"');
    expect(input(view("plato"), "fr-gravity")).not.toContain("inputMode");
  });
  it("opens a live sheet on Temperature, and leaves an inventory frame's focus alone", () => {
    expect(input(view("sg", () => {}), "fr-temp")).toContain("autofocus");
    expect(input(view("sg"), "fr-temp")).not.toContain("autofocus");
  });
  it("fills the field's width with a labelled stepper", () => {
    expect(view("sg")).toContain("_[data-slot=button-group]]:w-full");
  });
  it("stacks its live actions full width, as the inventory frame does", () => {
    expect(readFileSync("app/(app)/cellar/[occupancyId]/reading/reading-form.tsx", "utf8")).toContain("footer={E.pin(<FermentationReadingActionsView");
  });
});
