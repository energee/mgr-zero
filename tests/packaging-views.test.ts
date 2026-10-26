import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PackagingRunsView } from "../components/mgr/views/packaging-runs";
import { RepackView } from "../components/mgr/views/repack";
import { SchedulePackagingRunView } from "../components/mgr/views/schedule-packaging-run";
import { packagingRuns, repackCase, schedulePackagingRun } from "../lib/mgr/fixtures/packaging";
import { DEMO_TIME_ZONE } from "../lib/mgr/fixtures/settings";
import { toPackagingRunsViewProps } from "../lib/mgr/packaging-runs-view";
import { scheduleRunReason, toSchedulePackagingRunView } from "../lib/mgr/schedule-packaging-run-view";
import { breweryDate } from "../lib/date-format";
const screen = (name: string) => SCREENS.find((entry) => entry.name === name)!;
const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("packaging views", () => {

  it("mounts shared views for all three inventory records", () => {
    const runs = screen("Packaging runs").body as { type: unknown; props: { model: unknown } };
    const schedule = screen("Schedule packaging run").body as { type: unknown; props: { model: unknown } };
    const repack = screen("Repack").body as { type: unknown; props: { model: unknown } };

    expect(isValidElement(runs)).toBe(true);
    expect(runs.type).toBe(PackagingRunsView);
    expect(runs.props.model).toEqual(toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE));
    expect(schedule.type).toBe(SchedulePackagingRunView);
    expect(schedule.props.model).toEqual(schedulePackagingRun);
    const repackView = (repack.props as unknown as { children: [{ type: unknown; props: { model: unknown } }] }).children[0];
    expect(repackView.type).toBe(RepackView);
    expect(repackView.props.model).toEqual(repackCase);
  });

  it("keeps fixture actions inert and explicit null slots empty", () => {
    const runs = htmlOf(createElement(PackagingRunsView, { model: toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE) }));
    expect(runs).toMatch(/>Packaging</);
    expect(runs).not.toMatch(/href="\/packaging/);
    expect(htmlOf(createElement(SchedulePackagingRunView, { model: schedulePackagingRun }))).toMatch(/Save run plan/);
    expect(htmlOf(createElement(RepackView, { model: repackCase, footer: null }))).not.toMatch(/Record repack/);
  });

  it("labels material identity and planned quantity separately with the requirements vocabulary", () => {
    const html = htmlOf(createElement(SchedulePackagingRunView, { model: schedulePackagingRun }));
    const headers = [...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));
    expect(headers).toEqual(["Material", "Planned", "On hand", "Short"]);
    const cells = [...html.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
    expect(cells.slice(0, 8)).toEqual(["cans", "2,832 each", "3,100", "0", "ends", "2,832 each", "2,400", "432"]);
    expect(html).toContain("432 ends short");
  });

  it("the live list mounts PackagingRunsView and slots both controlled forms", () => {
    const page = readFileSync("app/(app)/packaging/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/packaging-runs"/);
    expect(page).toMatch(/<PackagingRunsView\b/);
    expect(page).toMatch(/<ScheduleRunForm\b/);
    const form = readFileSync("app/(app)/packaging/schedule-run-form.tsx", "utf8");
    expect(form).toMatch(/<SchedulePackagingRunView\b/);
    expect(page).toMatch(/<RepackForm\b/);
    const repackForm = readFileSync("app/(app)/packaging/repack-form.tsx", "utf8");
    expect(repackForm).toMatch(/<RepackView\b/);
    expect(repackForm).toMatch(/toRepackView\(/);
    expect(repackForm).not.toMatch(/Child qty|childSkuId, setChildSkuId/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("an empty list says how to plan a run, and a list with runs has no empty state (#1129)", () => {
    const model = toPackagingRunsViewProps([], DEMO_TIME_ZONE);
    expect(model.empty).toEqual({ title: "No runs planned", description: expect.stringContaining("Schedule run") });
    const html = htmlOf(createElement(PackagingRunsView, { model, actions: null }));
    expect(html).toContain("No runs planned");
    expect(html).toContain(model.empty?.description);
    expect(toPackagingRunsViewProps(packagingRuns, DEMO_TIME_ZONE).empty).toBeUndefined();
  });

  it("separates planned facts and preserves zero without inventing a package unit", () => {
    const [upcoming] = toPackagingRunsViewProps([{
      id: "u", run_no: 8, planned_on: "2026-09-05", started_at: null, closed_at: null, cancelled_at: null,
      brand_name: "Pils", vessel_name: null, qty_planned: 0,
    }], DEMO_TIME_ZONE).upcoming;
    expect(upcoming).toMatchObject({ runNo: "RUN-0008", brand: "Pils", date: "Sep 5, 2026", source: null, quantity: "0", verb: "Pick source" });
    expect(upcoming.output).toBeUndefined();
    expect(upcoming.yieldPercent).toBeUndefined();
    expect(upcoming.lossBbl).toBeUndefined();
  });

  it("a finished run is a row link with no Open verb, so it never reads as reopen (#996)", () => {
    const base = { planned_on: "2026-09-01", started_at: "2026-09-03T15:00:00Z", brand_name: "Pils", vessel_name: "FV1", qty_planned: 10 };
    const model = toPackagingRunsViewProps([
      { ...base, id: "closed", run_no: 7, closed_at: "2026-09-04T18:30:00Z", cancelled_at: null },
      { ...base, id: "cancelled", run_no: 8, closed_at: null, cancelled_at: "2026-09-04T18:30:00Z" },
    ], DEMO_TIME_ZONE, (id) => `/packaging/${id}`);
    expect(model.recent.map((row) => row.verb)).toEqual([undefined, undefined]);
    const markup = htmlOf(createElement(PackagingRunsView, { model, actions: null }));
    expect(markup).toContain('href="/packaging/closed"');
    expect(markup).toContain('href="/packaging/cancelled"');
    expect(markup).not.toMatch(/>Open</);
  });

  it("dates finished runs by the brewery-local close or cancellation day", () => {
    const base = { planned_on: "2026-09-01", started_at: null, brand_name: "Pils", vessel_name: "FV1", qty_planned: 10 };
    const model = toPackagingRunsViewProps([
      { ...base, id: "closed", run_no: 7, closed_at: "2026-09-05T01:30:00Z", cancelled_at: null },
      { ...base, id: "cancelled", run_no: 8, closed_at: null, cancelled_at: "2026-09-05T01:30:00Z" },
    ], "America/Los_Angeles");
    expect(model.recent.map(row => row.date)).toEqual(["Sep 4, 2026", "Sep 4, 2026"]);
  });

  it("keeps shortage precedence over physical work and preserves recorded zero yield and loss", () => {
    const base = { id: "r", run_no: 1, planned_on: "2026-09-05", started_at: null, closed_at: null, cancelled_at: null, brand_name: "Pils", vessel_name: "FV1", qty_planned: 10, planned_unit: "kegs" };
    for (const started_at of [null, "2026-09-05"]) {
      const model = toPackagingRunsViewProps([{ ...base, started_at, material_shortfall: "12 ends short" }], "UTC");
      expect(model.upcoming[0]).toMatchObject({ quantity: "10 kegs", shortfall: "12 ends short", verb: "Resolve", tone: "attention" });
    }
    const model = toPackagingRunsViewProps([{ ...base, closed_at: "2026-09-05", output_summary: "0 kegs", yield_percent: 0, loss_bbl: 0 }], "UTC");
    expect(model.recent[0]).toMatchObject({ output: "0 kegs", yieldPercent: 0, lossBbl: 0 });
  });

  it("does not present a plan as actual output and renders recorded zeroes instead of blanks", () => {
    const run = { id: "r", run_no: 1, planned_on: "2026-09-05", started_at: null, closed_at: "2026-09-06", cancelled_at: null, brand_name: "Pils", vessel_name: null, qty_planned: 20 };
    const planned = htmlOf(createElement(PackagingRunsView, { model: toPackagingRunsViewProps([run], "UTC") }));
    expect(planned).toContain("Planned quantity");
    expect(planned).not.toMatch(/>Output<|>Yield<|>Loss \(bbl\)</);
    const model = toPackagingRunsViewProps([{ ...run, output_summary: "0 kegs", yield_percent: 0, loss_bbl: 0 }, { ...run, id: "missing", run_no: 2 }], "UTC");
    const recorded = htmlOf(createElement(PackagingRunsView, { model })).match(/<table\b[\s\S]*?<\/table>/)![0];
    const cells = [...recorded.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));
    expect(cells.slice(5, 8)).toEqual(["0 kegs", "0%", "0"]);
    expect(cells.slice(13, 16)).toEqual(["", "", ""]);
  });

  it("explains every missing scheduling requirement without requiring a source tank (#1256)", () => {
    const model = toSchedulePackagingRunView({ brands: [], occupancies: [], skus: [] }, { brandId: "", occupancyId: "", plannedOn: "", qty: {} });
    expect(scheduleRunReason(model)).toBe("Still needed: a brand, a planned date, and a positive planned output quantity.");
    const dated = { ...model, brandId: "b1", plannedOn: "2026-10-23" };
    expect(scheduleRunReason(dated)).toBe("Still needed: a positive planned output quantity.");
    for (const qty of ["", "0", "-1", "not a quantity"]) {
      expect(scheduleRunReason({ ...dated, outputs: [{ key: "s1", title: "Keg", detail: "", qty }] })).not.toBeNull();
    }
    const ready = { ...dated, outputs: [{ key: "s1", title: "Keg", detail: "", qty: "2" }] };
    expect(scheduleRunReason(ready)).toBeNull();
    expect(scheduleRunReason({ ...ready, brandId: "" })).toBe("Still needed: a brand.");
    expect(scheduleRunReason({ ...ready, plannedOn: "" })).toBe("Still needed: a planned date.");
    const readyHtml = htmlOf(createElement(SchedulePackagingRunView, { model: ready }));
    expect(readyHtml).not.toContain("Still needed:");
    expect(readyHtml.match(/<button[^>]*>Save run plan/)?.[0]).not.toContain(' disabled=""');
    const html = htmlOf(createElement(SchedulePackagingRunView, { model }));
    expect(html).toContain("Still needed:");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save run plan/);
  });

  it("explains empty brands and open tanks beside real pickers (#1256)", () => {
    const model = toSchedulePackagingRunView({ brands: [], occupancies: [], skus: [] }, { brandId: "", occupancyId: "", plannedOn: "", qty: {} });
    const html = htmlOf(createElement(SchedulePackagingRunView, { model, catalogHref: "/catalog" }));
    expect(html).toContain("No brands yet.");
    expect(html).toMatch(/href="\/catalog"[^>]*>Add a brand in Catalog/);
    expect(html).toContain("No occupied tanks yet. Leave the source blank and pick it before starting the run.");
    expect(html).toMatch(/<button[^>]*role="combobox"[^>]*aria-label="Source tank · optional"/);
    expect(html).not.toMatch(/<input[^>]*placeholder="No source yet"/);
    expect(htmlOf(createElement(SchedulePackagingRunView, { model }))).not.toContain('href="/catalog"');
    const nonCreator = htmlOf(createElement(SchedulePackagingRunView, { model, catalogHref: null }));
    expect(nonCreator).toContain("An admin or sales member can add a brand in Catalog.");
    expect(nonCreator).not.toMatch(/<a [^>]*>Add a brand in Catalog/);
    const populated = htmlOf(createElement(SchedulePackagingRunView, { model: schedulePackagingRun }));
    expect(populated).not.toContain("No brands yet.");
    expect(populated).not.toContain("No occupied tanks yet.");
  });

  it("builds the live Schedule run model from the page's reads, gating what they cannot say", () => {
    const data = {
      brands: [{ id: "b1", name: "Pils" }, { id: "b2", name: "Stout", alias: "Animal #14" }],
      occupancies: [{ occupancy_id: "o1", vessel_name: "FV1", brand_name: "Pils", batch_no: 12, bbl: 20 }],
      skus: [
        { id: "s1", name: "Pils ½ bbl", brand_id: "b1", format_volume: { bbl_per_unit: 0.5 } },
        { id: "s2", name: "Pils case", brand_id: "b1", format_volume: null },
        { id: "s3", name: "Stout ½ bbl", brand_id: "b2", format_volume: { bbl_per_unit: 0.5 } },
      ],
    };
    const empty = toSchedulePackagingRunView(data, { brandId: "", occupancyId: "", plannedOn: "", qty: {} });
    // A brand's staff-only alias follows its name in the picker (brand-alias.md).
    expect(empty.brandOptions).toEqual([{ value: "b1", label: "Pils" }, { value: "b2", label: "Stout · Animal #14" }]);
    expect(empty.outputs).toEqual([]);
    expect(empty.sourceOptions[0]).toEqual({ value: "", label: "No source yet" });
    expect(empty.source).toBe("");
    expect(empty.leftInSource).toBeUndefined();
    // No shortfall read exists, so the model never claims a materials table.
    expect(empty.materials).toBeUndefined();

    const model = toSchedulePackagingRunView(data, { brandId: "b1", occupancyId: "o1", plannedOn: "2026-10-01", qty: { s1: "10", s3: "4" } });
    expect(model.outputs.map((o) => o.key)).toEqual(["s1", "s2"]);
    expect(model.outputs[0]).toEqual({ key: "s1", title: "Pils ½ bbl", detail: "5 bbl", qty: "10" });
    expect(model.outputs[1].detail).toBe("");
    expect(model.source).toBe("FV1 · Pils");
    expect(model.sourceDetail).toBe("B-0012 · 20 bbl");
    expect(model).toMatchObject({ leftLabel: "Left in FV1", leftInSource: "15 bbl" });
    // A planned SKU with no known barrels per unit leaves the remainder unknown, not guessed.
    expect(toSchedulePackagingRunView(data, { brandId: "b1", occupancyId: "o1", plannedOn: "", qty: { s2: "3" } }).leftInSource).toBeUndefined();
  });

  it("requires whole planned kegs without rejecting fractional non-keg packages or dropping an invalid spare line (#1380)", () => {
    const data = {
      brands: [{ id: "b", name: "Fictional Pils" }], occupancies: [],
      skus: [
        { id: "keg", name: "Draft package", brand_id: "b", formats: { package_type: "keg" }, format_volume: { bbl_per_unit: 0.5 } },
        { id: "case", name: "Keg-named case", brand_id: "b", formats: { package_type: "can" }, format_volume: { bbl_per_unit: 0.1 } },
      ],
    };
    const draft = { brandId: "b", occupancyId: "", plannedOn: "2026-10-25", qty: { keg: "1.5", case: "2" } };
    expect(scheduleRunReason(toSchedulePackagingRunView(data, draft))).not.toBeNull();
    expect(scheduleRunReason(toSchedulePackagingRunView(data, { ...draft, qty: { keg: "2", case: "1.5" } }))).toBeNull();
    for (const keg of ["1e1", "-1", "NaN"]) {
      expect(scheduleRunReason(toSchedulePackagingRunView(data, { ...draft, qty: { keg, case: "2" } }))).not.toBeNull();
    }
  });

  it("warns about a selected tank shortage but permits that plan and a legitimate no-source plan (#1380)", () => {
    const data = {
      brands: [{ id: "b", name: "Fictional Pils" }],
      occupancies: [{ occupancy_id: "o", vessel_name: "Fictional brite", brand_name: "Fictional Pils", batch_no: 1, bbl: 5 }],
      skus: [{ id: "keg", name: "Draft package", brand_id: "b", formats: { package_type: "keg" }, format_volume: { bbl_per_unit: 0.5 } }],
    };
    const draft = { brandId: "b", occupancyId: "o", plannedOn: "2026-10-25", qty: { keg: "11" } };
    const model = toSchedulePackagingRunView(data, draft);
    expect(model.sourceWarning).toContain("more beer");
    expect(scheduleRunReason(model)).toBeNull();
    const noSource = toSchedulePackagingRunView(data, { ...draft, occupancyId: "" });
    expect(noSource.sourceWarning).toBeUndefined();
    expect(noSource.leftInSource).toBeUndefined();
    expect(scheduleRunReason(noSource)).toBeNull();
  });

  it("warns only before brewery-local today and visibly marks only active overdue plans (#1380)", () => {
    const at = new Date("2026-10-26T01:00:00Z");
    const today = breweryDate("America/Los_Angeles", at);
    const draft = { brandId: "", occupancyId: "", plannedOn: "2026-10-24", qty: {} };
    const data = { brands: [], occupancies: [], skus: [] };
    expect(toSchedulePackagingRunView(data, draft, today).dateWarning).toContain("past");
    expect(toSchedulePackagingRunView(data, { ...draft, plannedOn: today }, today).dateWarning).toBeUndefined();
    const base = { run_no: 1, planned_on: "2026-10-24", started_at: null, closed_at: null, cancelled_at: null, brand_name: "Fictional Pils", vessel_name: null, qty_planned: 2 };
    const model = toPackagingRunsViewProps([
      { ...base, id: "old" }, { ...base, id: "today", planned_on: today },
      { ...base, id: "closed", closed_at: at.toISOString() }, { ...base, id: "cancelled", cancelled_at: at.toISOString() },
    ], "America/Los_Angeles", undefined, at);
    expect(model.upcoming.map(row => row.overdue)).toEqual([true, false]);
    expect(model.recent.every(row => !row.overdue)).toBe(true);
    expect(htmlOf(createElement(PackagingRunsView, { model }))).toContain("Overdue");
  });

  it("offers empty-package recovery only to catalog creators and keeps inventory destinations inert (#1380)", () => {
    const model = toSchedulePackagingRunView({ brands: [{ id: "b", name: "Fictional Pils" }], occupancies: [], skus: [] }, { brandId: "b", occupancyId: "", plannedOn: "", qty: {} });
    expect(htmlOf(createElement(SchedulePackagingRunView, { model, catalogHref: "/catalog" }))).toMatch(/href="\/catalog"[^>]*>Add a package in Catalog/);
    const denied = htmlOf(createElement(SchedulePackagingRunView, { model, catalogHref: null }));
    expect(denied).toContain("An admin or sales member can add a package in Catalog.");
    expect(denied).not.toContain('href="/catalog"');
    expect(htmlOf(createElement(SchedulePackagingRunView, { model }))).not.toContain('href="/catalog"');
  });

  // #1125: copy and labels only; repack has no damage input.
  it("labels the Repack fields and says plainly that repack records no damage", () => {
    const html = htmlOf(createElement(RepackView, { model: repackCase, footer: null }));
    const forId = /<label[^>]*for="([^"]+)"[^>]*>Packages to repack<\/label>/.exec(html)?.[1];
    expect(forId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input[^>]*id="${forId}"`));
    expect(html).toMatch(/>Package to break down</);
    expect(html).not.toMatch(/Damaged on break/);
    expect(html).toContain("Repack doesn’t record damage");
  });

  it("explains Untracked stock where the Lot picker offers it, tied to the picker", () => {
    // The inventory fixture carries the lot list, so the frame shows the picker and its help.
    const html = htmlOf(createElement(RepackView, { model: repackCase, footer: null }));
    const id = /<p[^>]*id="([^"]+)"[^>]*>Untracked stock is stock recorded without a lot\./.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<button[^>]*aria-label="Lot"[^>]*aria-describedby="${id}"|<button[^>]*aria-describedby="${id}"[^>]*aria-label="Lot"`));
  });
});
