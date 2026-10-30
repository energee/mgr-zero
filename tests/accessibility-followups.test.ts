import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { ListControls } from "@/components/mgr/list-controls";
import { VolumeField } from "@/components/mgr/volume-field";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";

it("exposes date errors on the calendar trigger without a second accessible date input", () => {
  const html = renderToStaticMarkup(E.edit("Due on", "2026-10-30", "date", undefined, { name: "due", required: true, id: "due", error: "Choose an earlier date." }));
  expect(html).toMatch(/<button[^>]*aria-invalid="true"/);
  expect(html).toMatch(/<button[^>]*aria-describedby="due-error"/);
  expect(html).toMatch(/<input[^>]*aria-hidden="true"[^>]*name="due"/);
  expect(html).toContain('data-required="true"');
  expect(html).toContain("Choose an earlier date.");
});

it("announces the current list result count politely", () => {
  const html = renderToStaticMarkup(createElement(ListControls, { resultCount: 0, search: { label: "Search customers", value: "none", keep: {} } }));
  expect(html).toMatch(/role="status" aria-live="polite" aria-atomic="true"[^>]*>0 results<\/p>/);
});

it("marks the current import step in an ordered list", () => {
  const html = renderToStaticMarkup(E.stp(["Upload", "Review", "Import"], 1));
  expect(html).toMatch(/^<ol /);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  expect(html).toMatch(/<li[^>]*aria-current="step"[^>]*><span[^>]*>Review<\/span>/);
});

it("marks invalid multi-select choices instead of their group", () => {
  const html = renderToStaticMarkup(E.picks("Uses", [], ["Warehouse", "Taproom"], { "aria-invalid": true }));
  expect(html).not.toMatch(/role="group"[^>]*aria-invalid/);
  expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
});

it("offers volume units as named radios, not tabs", () => {
  const html = renderToStaticMarkup(createElement(VolumeField, { value: "5", units: ["gal", "bbl"], on: 1 }));
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="Volume unit"');
  expect(html.match(/role="radio"/g)).toHaveLength(2);
  expect(html).toMatch(/role="radio" aria-checked="true"[^>]*value="bbl"/);
  expect(html).not.toContain('role="tab"');
});

it("names the theme action without contradictory pressed state", () => {
  const html = renderToStaticMarkup(createElement(ThemeToggle, { compact: true }));
  expect(html).toContain('aria-label="Switch to dark mode"');
  expect(html).not.toContain("aria-pressed");
});

it("keeps gated explanations undimmed", () => {
  const html = renderToStaticMarkup(E.gated("Unavailable feature"));
  expect(html).toContain("isn’t available yet");
  expect(html).not.toContain("opacity-50");
});

it("names each brewery-settings stepper action after its field", () => {
  const html = renderToStaticMarkup(createElement(BrewerySettingsFormView, {
    initial: { name: "Example Brewing", timezone: "UTC", ttb: "", phone: "", hours: "24", daysToPackage: "14", booksOpenedOn: "", oneWayKegFee: "0" },
  }));
  for (const label of ["One-way keg fee ($)", "Reading overdue after (hours)", "Days to package"]) {
    expect(html).toContain(`aria-label="Decrease ${label}"`);
    expect(html).toContain(`aria-label="Increase ${label}"`);
  }
});
