// tests/production-view.test.ts — Batches, Brew day, packaging close, and
// recipe adapters plus HTML. Views own no sample data. Live NewBatchForm /
// RecordBrewDayForm / CloseRunForm / RecipeEditor stay wrappers.
import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BatchesView } from "../components/mgr/views/batches";
import { BrewDayView } from "../components/mgr/views/brew-day";
import { BrewPrepView } from "../components/mgr/views/brew-prep";
import { BrewTimelineView } from "../components/mgr/views/brew-timeline";
import { ClosePackagingRunView } from "../components/mgr/views/close-packaging-run";
import { RecipeView } from "../components/mgr/views/recipe";
import { RecipesView } from "../components/mgr/views/recipes";
import { RunClosedView } from "../components/mgr/views/run-closed";
import { ScheduleBatchView } from "../components/mgr/views/schedule-batch";
import { VesselDetailView } from "../components/mgr/views/vessel-detail";
import {
  batchesBrewer, brewDayHazy, brewDayTurnsHazy, brewPrepMineral, brewTimelineMineral, closePackagingRunHazy, recipeHazyV4, recipesList,
  runClosedHazy, scheduleBatchHazy, vesselFv3, vesselNew, cellarTransferPils, cellarAdditionCitra,
} from "../lib/mgr/fixtures/production";
import { toBatchesViewProps, batchesFromQuery, type BatchListRow } from "../lib/mgr/batches-view";
import { CHANGE_PLAN_ID } from "../lib/mgr/brew-prep-view";
import { brewTurnModel, canRecordBrewDay } from "../lib/mgr/brew-day-view";
import { hasPackagingMaterials } from "../lib/mgr/packaging-actuals";
import { PlanActions } from "../components/mgr/views/plan-actions";
import { toRecipesViewProps } from "../lib/mgr/recipes-view";
import { resolveTap } from "../lib/mgr/screen-links";
import { formatVesselReading } from "../lib/mgr/vessel-detail-view";
import { cellarReadings, toCellarMapViewProps } from "../lib/mgr/cellar-map-view";
import { CellarMapView } from "../components/mgr/views/cellar-map";
import { CellarTransferView } from "../components/mgr/views/cellar-transfer";
import { CellarAdditionView } from "../components/mgr/views/cellar-addition";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Production dates (#991)", () => {
  it("prints packaged, best-by, planned and brewed days in the one date format", () => {
    const closed = htmlOf(createElement(RunClosedView, { model: { ...runClosedHazy, lot: { ...runClosedHazy.lot!, best_by: "2027-03-04" } } }));
    expect(closed).toContain("Sep 5, 2026");
    expect(closed).toContain("Mar 4, 2027");
    // created_at is an instant: 02:00 UTC on Sep 6 is still Sep 5 in New York.
    const history = htmlOf(createElement(RunClosedView, { model: { ...runClosedHazy, timeZone: "America/New_York", records: [{ ...runClosedHazy.records![0]!, created_at: "2026-09-06T02:00:00Z" }] } }));
    expect(history).toMatch(/Original close<[^]*?Sep 5, 2026/);
    expect(history).not.toContain("2026-09-06");
    expect(htmlOf(createElement(ClosePackagingRunView, { model: { title: "Run", plannedOn: "2026-09-28" } }))).toContain("Sep 28, 2026");
    const brewed = htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, recorded: true } }));
    expect(brewed).toContain("Sep 4, 2026");
    expect(brewed).not.toMatch(/Brewed on<[^]*?2026-09-04/);
  });
});
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

it("cellar derives fills from occupancy and keeps links explicit", () => {
  const vessels = [{ id: "v1", name: "Actual tank", capacity_bbl: 10 }, { id: "v2", name: "Empty tank", capacity_bbl: 5 }];
  const occupancies = [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, bbl: 2.5 }];
  const model = toCellarMapViewProps(vessels, occupancies);
  expect(model.tiles[0]).toMatchObject({ fill: 25, detail: "No brand yet · 2.5 / 10 bbl", reading: "No readings yet", href: undefined });
  expect(model.tiles[1]).toMatchObject({ fill: 0, reading: "available" });
  const live = toCellarMapViewProps(vessels, occupancies, { o1: "Actual reading" }, { v1: "/cellar/vessels/v1" });
  expect(htmlOf(createElement(CellarMapView, { model: live }))).toContain('href="/cellar/vessels/v1"');
  expect(htmlOf(createElement(CellarMapView, { model }))).not.toContain('href="/cellar');
  expect(toCellarMapViewProps([{ ...vessels[0], capacity_bbl: 0 }], occupancies).tiles[0].fill).toBeUndefined();
});

it("#1516 puts Complete batch with the cellar actions above the tiles, which fill a wide screen", () => {
  const model = toCellarMapViewProps([{ id: "v1", name: "FV1", capacity_bbl: 10 }], []);
  const html = htmlOf(createElement(CellarMapView, { model }));
  expect(html.indexOf(">Complete batch</button>")).toBeLessThan(html.indexOf("FV1"));
  expect(html).toContain("md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]");
});

describe("cellar first-vessel setup (#1254)", () => {
  it("puts the primary Add vessel action inside the empty state", () => {
    const model = { ...toCellarMapViewProps([], []), addHref: "/cellar/vessels/new", brewHref: "/batches" };
    const html = htmlOf(createElement(CellarMapView, { model }));
    expect(html).toContain("No vessels yet");
    expect(html).toContain("Add your tanks to start tracking the cellar.");
    expect(html).toMatch(/data-slot="empty-content"[^]*?data-variant="default"[^]*?href="\/cellar\/vessels\/new"[^>]*>Add vessel<\/a>/);
    expect(html.match(/>Add vessel<\/a>/g)).toHaveLength(1);
    expect(html).not.toContain("Start a brew day in Batches");
    // The disabled Reading, Transfer and Addition still say why (#1122).
    expect(html).toContain("No tank holds beer");
  });

  it("keeps vessel creation admin-only even in the empty state", () => {
    const model = { ...toCellarMapViewProps([], []), addHref: null, brewHref: "/batches" };
    const html = htmlOf(createElement(CellarMapView, { model }));
    expect(html).toContain("Add your tanks to start tracking the cellar.");
    expect(html).not.toContain("Add vessel");
    expect(html).not.toContain("Start a brew day in Batches");
  });
});

describe("vessels are admin-managed", () => {
  it("a brewer reads vessel facts as text, with no Save or Delete", () => {
    const html = htmlOf(createElement(VesselDetailView, { model: vesselFv3, editable: false, remove: "Delete vessel" }));
    expect(html).toContain(vesselFv3.name);
    expect(html).toContain("Capacity (bbl)");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Save vessel");
    expect(html).not.toContain("Delete vessel");
  });

  it("keeps Delete vessel in its own bordered section after Save vessel (#1481)", () => {
    const html = htmlOf(createElement(VesselDetailView, { model: vesselFv3, remove: createElement("button", { type: "button" }, "Delete FV3") }));
    expect(html.indexOf("Save vessel")).toBeGreaterThan(-1);
    expect(html.indexOf("Save vessel")).toBeLessThan(html.indexOf("Delete FV3"));
    expect(html).toMatch(/<section aria-label="Delete vessel" class="[^"]*border-t[^"]*">[\s\S]*Delete FV3/);
    expect(htmlOf(createElement(VesselDetailView, { model: vesselFv3 }))).not.toContain('aria-label="Delete vessel"');
  });

  it("a retired vessel says so", () => {
    expect(htmlOf(createElement(VesselDetailView, { model: { ...vesselFv3, retired: true } }))).toContain("retired");
    expect(htmlOf(createElement(VesselDetailView, { model: vesselFv3 }))).not.toContain("retired");
  });

  it("hides Add vessel and New vessel when their href is null", () => {
    const model = toCellarMapViewProps([{ id: "v1", name: "Tank", capacity_bbl: 10 }], []);
    expect(htmlOf(createElement(CellarMapView, { model }))).toContain("Add vessel");
    expect(htmlOf(createElement(CellarMapView, { model: { ...model, addHref: null } }))).not.toContain("Add vessel");
    expect(htmlOf(createElement(BatchesView, { model: toBatchesViewProps(batchesBrewer) }))).toContain("New vessel");
    expect(htmlOf(createElement(BatchesView, { model: toBatchesViewProps(batchesBrewer), newVesselHref: null }))).not.toContain("New vessel");
  });

  it("keeps New batch primary and New vessel secondary within vessel setup (#1129)", () => {
    const markup = htmlOf(createElement(BatchesView, { model: toBatchesViewProps(batchesBrewer), newVesselHref: "/cellar/vessels/new" }));
    expect(markup).toMatch(/data-variant="default"[^>]*>New batch</);
    expect(markup).toMatch(/data-variant="outline"[^>]*href="\/cellar\/vessels\/new"[^>]*>New vessel</);
    expect(markup.indexOf(">Vessels<")).toBeLessThan(markup.indexOf(">New vessel<"));
  });
});

it("vessel readings preserve optional measurements and do not invent actors", () => {
  const reading = { id: "r1", at: "2026-09-12", temp_f: 68, gravity_plato: null, ph: null, note: null };
  expect(formatVesselReading(reading, "plato")).toBe("68 °F");
  const html = htmlOf(createElement(VesselDetailView, { model: { ...vesselFv3, occupancy: undefined, readings: { current: "68 °F", history: [{ key: "r1", title: reading.at, detail: "68 °F" }] } }, submitting: true, messages: "Save failed", footer: null }));
  expect(html).toContain("No open occupancy");
  expect(html).toContain("Save failed");
  expect(html).toContain("disabled");
  expect(html).not.toContain("Save vessel");
  expect(html).not.toContain("Dana");
});

describe("Batches view", () => {
  it("groups returned lifecycle facts without inventing readings or hiding closed batches", () => {
    const base: BatchListRow = { id: "planned", batch_no: null, planned_on: "2026-09-12", planned_bbl: 12.5, brewed_on: null, closed_at: null, cancelled_at: null, brand_name: null, recipe_name: null, vessel_name: "Actual tank", active_occupancies: [] };
    expect(batchesFromQuery([base], []).planned?.[0].href).toBeUndefined();
    const model = toBatchesViewProps(batchesFromQuery([base, { ...base, id: "active", brewed_on: "2026-09-12", vessel_name: null }, { ...base, id: "closed", brewed_on: "2026-09-11", closed_at: "2026-09-12", vessel_name: null }], [], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}` }));
    // Facts arrive as fields, never as one delimited sentence; missing brand and recipe stay null.
    expect(model.planned[0]).toEqual({ key: "planned", batchNo: "Batch", brand: null, recipe: null, plannedOn: "Sep 12, 2026", plannedBbl: 12.5, vessel: "Actual tank", href: "/batches/planned" });
    expect(model.active[0]).toMatchObject({ href: "/batches/active", readings: [] });
    expect(model.completed?.[0]).toMatchObject({ key: "closed" });
    expect(model.completed?.[0].readings).toBeUndefined();
    const html = htmlOf(createElement(BatchesView, { model, workHrefs: { all: "/work", batches: "/batches" }, newVesselHref: "/cellar/vessels/new" }));
    for (const text of ["Planned", "Active", "Completed", "No open occupancy", "Actual tank", "No brand yet", "No recipe", "Sep 12, 2026", "12.5", "No vessels yet"]) expect(html).toContain(text);
    expect(html).not.toContain("2026-09-12");
    expect(html).not.toContain("°P");
    expect(html).toContain('href="/batches"');
    expect(html).not.toContain('href="/orders"');
    // The row link already opens the batch; no Brew button repeats it (#1512).
    expect(html).not.toMatch(/>Brew</);
  });
  it("marks a planned batch dated before the brewery's day overdue and links it to its open Change plan (#1582)", () => {
    const base: BatchListRow = { id: "late", batch_no: 3, planned_on: "2026-09-12", planned_bbl: 10, brewed_on: null, closed_at: null, cancelled_at: null, brand_name: null, recipe_name: null, vessel_name: null, active_occupancies: [] };
    const rows = [base, { ...base, id: "today", planned_on: "2026-10-28" }, { ...base, id: "brewed", brewed_on: "2026-09-12" }, { ...base, id: "gone", cancelled_at: "2026-09-13" }];
    const hrefs = { batch: (id: string) => `/batches/${id}`, vessel: (id: string) => `/cellar/vessels/${id}` };
    const model = toBatchesViewProps(batchesFromQuery(rows, [], hrefs, { unit: "plato", timeZone: "UTC", today: "2026-10-28" }));
    expect(model.planned[0]).toMatchObject({ key: "late", overdue: true, href: `/batches/late#${CHANGE_PLAN_ID}` });
    expect(model.planned[1]).toMatchObject({ key: "today", href: "/batches/today" });
    expect(model.planned[1].overdue).toBeUndefined();
    expect(model.active[0].overdue).toBeUndefined();
    expect(model.cancelled?.[0].overdue).toBeUndefined();
    // No brewery day (the inventory's query fixtures): nothing is overdue.
    expect(batchesFromQuery([base], [], hrefs).planned?.[0]).toMatchObject({ href: "/batches/late" });
    const html = htmlOf(createElement(BatchesView, { model }));
    // One overdue row, drawn once in the table and once in the phone list.
    expect(html.match(/>Overdue</g)).toHaveLength(2);
    expect(html).toContain(`href="/batches/late#${CHANGE_PLAN_ID}"`);
  });
  it("explains vessel setup and keeps its empty note separate from the page empty state (#1303)", () => {
    const model = toBatchesViewProps({ ...batchesBrewer, vessels: [] });
    const html = htmlOf(createElement(BatchesView, { model, newVesselHref: null }));
    const setup = html.match(/<section aria-label="Vessel setup"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    expect(setup).toBeDefined();
    expect(setup).toContain("No vessels yet");
    expect(setup).not.toContain('data-slot="empty"');
    expect(setup).not.toContain("New vessel");
    const withoutSetup = htmlOf(createElement(BatchesView, { model: { ...model, vessels: undefined } }));
    expect(withoutSetup).not.toContain('aria-label="Vessel setup"');
  });
  it("does not allow live JSX to replace the planned and active lists", () => {
    const page = src("app/(app)/batches/page.tsx");
    expect(page).not.toMatch(/\blist=|\bfooter=|tabs=\{null\}/);
  });
  it("titles the fixture and live Batches lists alike", () => {
    const model = toBatchesViewProps(batchesBrewer);
    expect(model.title).toBe("Batches");
    expect(batchesFromQuery([], []).title).toBe("Batches");
    expect(model.workChipIndex).toBe(3);
  });

  it("maps each vessel to its own fields and edit destination", () => {
    const vessels = batchesFromQuery([], [{ id: "v4", name: "FV4", kind: "fermenter", capacity_bbl: 10, active: false }], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}` }).vessels;
    expect(vessels).toEqual([{ key: "v4", name: "FV4", kind: "Fermenter", capacityBbl: 10, active: false, href: "/cellar/vessels/v4" }]);
  });

  it("the Batches inventory record is BatchesView", () => {
    const body = screen("Batches").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Batches").body)).toBe(true);
    expect(body.type).toBe(BatchesView);
    expect(body.props.model).toEqual(toBatchesViewProps(batchesBrewer));
  });

  it("the live Batches page mounts BatchesView and slots NewBatchForm", () => {
    const page = src("app/(app)/batches/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/batches"/);
    expect(page).toMatch(/<BatchesView\b/);
    expect(page).toContain('"/cellar/vessels/new"');
    expect(page).toMatch(/<NewBatchForm\b/);
    expect(page).not.toMatch(/ScheduleBatchView/);
  });
});

describe("New batch sheet", () => {
  it("the New batch inventory record is a sheet drawing ScheduleBatchView", () => {
    const record = screen("New batch");
    expect(record.surface).toBe("sheet");
    const body = record.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ScheduleBatchView);
    expect(body.props.model).toEqual(scheduleBatchHazy);
  });

  it("renders Schedule batch with no in-sheet title or back link (#1120, #1127)", () => {
    const html = htmlOf(createElement(ScheduleBatchView, { model: scheduleBatchHazy }));
    expect(html).toMatch(/>Schedule batch</);
    expect(html).not.toMatch(/<h1\b|<a\b/);
    expect(html).toMatch(/Note · optional/);
  });

  it("the live new-batch wrapper mounts the shared controlled body", () => {
    const form = src("app/(app)/batches/new-batch-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/schedule-batch"/);
    expect(form).toMatch(/<ScheduleBatchView\b/);
    expect(form).toMatch(/controls=\{controls\}/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });
});

describe("Brew day view", () => {
  it("folds Change plan at the foot of both planned tabs, after the form that saves or records", () => {
    const planActions = createElement(PlanActions, { plannedOn: "2026-10-22" });
    for (const html of [htmlOf(createElement(BrewPrepView, { model: brewPrepMineral, planActions })), htmlOf(createElement(BrewTimelineView, { model: brewTimelineMineral, planActions }))]) {
      for (const label of ["Reschedule or cancel", "Change plan", "Reschedule", "Cancel plan"]) expect(html).toContain(label);
      expect(html.search(/<summary[^>]*>Reschedule or cancel/)).toBeGreaterThan(html.lastIndexOf("</form>"));
      expect(html.indexOf("Planned")).toBeLessThan(html.indexOf("<form"));
      // On time, the fold stays closed.
      expect(html).not.toMatch(/<details[^>]*\bopen[^>]*><summary[^>]*>Reschedule or cancel/);
    }
  });
  it("opens Change plan on an overdue plan, at the anchor the Batches row links to (#1582)", () => {
    const planActions = createElement(PlanActions, { plannedOn: "2026-10-22" });
    for (const html of [htmlOf(createElement(BrewPrepView, { model: { ...brewPrepMineral, overdue: true }, planActions })), htmlOf(createElement(BrewTimelineView, { model: { ...brewTimelineMineral, overdue: true }, planActions }))]) {
      expect(html).toMatch(new RegExp(`<details(?=[^>]*\\bid="${CHANGE_PLAN_ID}")(?=[^>]*\\bopen)[^>]*><summary[^>]*>Reschedule or cancel`));
    }
  });
  it("draws Cancel plan as a small control beside Reschedule, not a full-width button (#995)", () => {
    const html = htmlOf(createElement(PlanActions, { plannedOn: "2026-09-04" }));
    const cancel = /<button[^>]*>Cancel plan<\/button>/.exec(html)?.[0] ?? "";
    expect(cancel).toContain('data-size="sm"');
    expect(html.indexOf("Reschedule")).toBeLessThan(html.indexOf("Cancel plan"));
    expect(html).toMatch(/<div class="flex flex-wrap[^"]*">[\s\S]*Reschedule[\s\S]*Cancel plan/);
  });

  it("rounds a pinned plan's per-bbl quantity the way the recipe page does (#995)", () => {
    const model = { ...brewDayHazy, plan: { ...brewDayHazy.plan!, ingredients: [{ id: "i", material_id: "m", materialName: "2-row", unit: "lb", stage: "mash" as const, per_bbl_qty: 18.181818 }] } };
    const html = htmlOf(createElement(BrewDayView, { model }));
    expect(html).toContain("18.2 lb per bbl");
    expect(html).not.toContain("18.181818");
  });

  it("makes multiple recorded turns reachable in the inventory", () => {
    const html = htmlOf(screen("Brew day").body);
    for (const label of ["Add brew turn", "Correct turn 1", "Correct turn 2", "Turn 1", "Turn 2"]) expect(html).toContain(label);
    expect(screen("Brew day").states).toContainEqual(expect.arrayContaining(["multiple turns"]));
  });
  it("requires actual form values and never offers to brew an already brewed batch again", () => {
    expect(canRecordBrewDay(brewDayHazy)).toBe(true);
    for (const patch of [{ initialBbl: "0" }, { initialBbl: "Infinity" }, { vesselId: "missing" }, { brewedOn: "" }, { recorded: true }]) expect(canRecordBrewDay({ ...brewDayHazy, ...patch })).toBe(false);
    const html = htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, recorded: true, initialBbl: "", vesselId: "", vesselName: undefined, lots: [], sheet: undefined, tapeHead: [] } }));
    expect(html).toContain("No open occupancy");
    expect(html).toContain("Unavailable after the occupancy closes");
    expect(html).not.toMatch(/>Record brew day</);
    expect(html).not.toContain("14.6");
    expect(src("app/(app)/batches/[id]/page.tsx")).toContain("Boolean(batch.brewed_on || occupancy)");
  });
  it("keeps ingredient corrections available when the original turn has no open vessel", () => {
    const correction = { ...brewDayHazy, recorded: false, vesselId: "", vessels: [], correctionRecordId: "record", correctionReason: "Correct weighed malt" };
    expect(canRecordBrewDay(correction)).toBe(true);
  });
  it("retains knockout inputs and command errors while pending", () => {
    const html = htmlOf(createElement(BrewDayView, { model: brewDayHazy, busy: true, error: "Vessel occupied" }));
    expect(html).toContain("Vessel occupied");
    expect(html).toContain('value="14.6"');
    expect(html).toContain("Sep 4, 2026");
    expect(html).toContain("disabled");
    expect(html).toContain("Confirm actual ingredients");
    expect(html).not.toContain('href="/');
  });
  it("does not substitute a separate live form for the brew-day screen", () => {
    expect(src("app/(app)/batches/[id]/record-brew-day-form.tsx")).toContain("<BrewDayView");
    expect(src("app/(app)/batches/[id]/record-brew-day-form.tsx")).not.toMatch(/<Input\b|<Label\b|<Select\b/);
    expect(src("app/(app)/batches/[id]/page.tsx")).not.toMatch(/\bbody=/);
  });
  it("the Brew day inventory record is BrewDayView", () => {
    const body = screen("Brew day").body as { props: { children: { type: unknown; props: { model: unknown } }[] } };
    expect(body.props.children.map(view => view.type)).toEqual([BrewDayView, BrewDayView]);
    expect(body.props.children.map(view => view.props.model)).toEqual([brewDayTurnsHazy, brewTurnModel(brewDayTurnsHazy)]);
  });

  it("renders Record brew day and knockout", () => {
    const html = htmlOf(createElement(BrewDayView, { model: brewDayHazy }));
    expect(html).toMatch(/>Record brew day</);
    expect(html).toMatch(/14\.6 bbl/);
    expect(html).toMatch(/FV2/);
  });

  it("the live batch page sends a planned batch to BrewTimelineView and a recorded or cancelled one to BrewDayView", () => {
    const page = src("app/(app)/batches/[id]/page.tsx");
    const form = src("app/(app)/batches/[id]/record-brew-day-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/brew-day"/);
    expect(form).toMatch(/<BrewDayView\b/);
    expect(form).toMatch(/from "@\/components\/mgr\/views\/brew-timeline"/);
    expect(form).toMatch(/<BrewTimelineView\b/);
    expect(page).toMatch(/<RecordBrewDayForm\b/);
    expect(page).toMatch(/<RecordBrewTimelineForm\b/);
  });

  it("the live batch page sends a planned batch's Prep tab to PrepForm, which binds BrewPrepView to save_batch_pulls", () => {
    const page = src("app/(app)/batches/[id]/page.tsx");
    const prep = src("app/(app)/batches/[id]/prep-form.tsx");
    expect(page).toMatch(/<PrepForm\b/);
    expect(page).toMatch(/openBrewTab\(tab, plan\.pulls\.length > 0\)/);
    expect(prep).toMatch(/from "@\/components\/mgr\/views\/brew-prep"/);
    expect(prep).toMatch(/<BrewPrepView\b/);
    expect(prep).toMatch(/run\("save_batch_pulls", \{ batchId, \.\.\.brewPullsPayload\(values\) \}/);
    expect(prep).toMatch(/onPrint=\{\(\) => window\.print\(\)\}/);
  });

  it("the Brew prep inventory record is BrewPrepView", () => {
    const body = screen("Brew prep").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrewPrepView);
    expect(body.props.model).toEqual(brewPrepMineral);
    expect((body.props as { planActions?: { type: unknown } }).planActions?.type).toBe(PlanActions);
  });

  it("links both tabs when live passes tab hrefs, and leaves them inert in the inventory", () => {
    const hrefs = { Prep: "/batches/b1?tab=prep", "Brew day": "/batches/b1?tab=brew-day" };
    const prep = htmlOf(createElement(BrewPrepView, { model: brewPrepMineral, tabHrefs: hrefs }));
    const timeline = htmlOf(createElement(BrewTimelineView, { model: brewTimelineMineral, tabHrefs: hrefs }));
    for (const html of [prep, timeline]) {
      expect(html).toContain('href="/batches/b1?tab=prep"');
      expect(html).toContain('href="/batches/b1?tab=brew-day"');
    }
    expect(htmlOf(createElement(BrewPrepView, { model: brewPrepMineral }))).not.toContain("?tab=");
  });

  it("Choose lot is left off a line whose material has no stock, which one note names instead (#1508)", () => {
    const html = htmlOf(createElement(BrewPrepView, { model: { ...brewPrepMineral, sources: [] } }));
    expect(html).not.toContain(">Choose lot</button>");
    expect(html).toContain("No stock to choose a source from for Chit Malt.");
    expect(htmlOf(createElement(BrewPrepView, { model: brewPrepMineral }))).toMatch(/<button(?![^>]*disabled="")[^>]*>Choose lot<\/button>/);
  });

  it("the Brew day timeline inventory record is BrewTimelineView with Change plan", () => {
    const body = screen("Brew day timeline").body as { type: unknown; props: { model: unknown; planActions: { type: unknown } } };
    expect(body.type).toBe(BrewTimelineView);
    expect(body.props.model).toEqual(brewTimelineMineral);
    expect(body.props.planActions.type).toBe(PlanActions);
  });

  it("draws the timeline's planned facts above the record form and Change plan after it, so their fields never submit it", () => {
    const html = htmlOf(createElement(BrewTimelineView, { model: brewTimelineMineral, planActions: createElement(PlanActions, { plannedOn: "2026-10-22" }) }));
    expect(html.indexOf("22 bbl · Oct 22, 2026")).toBeLessThan(html.indexOf("<form"));
    expect(html.indexOf("Change plan")).toBeGreaterThan(html.lastIndexOf("</form>"));
    expect(html).not.toContain("Confirm no ingredients used");
  });

  it("offers Confirm no ingredients used on the timeline only when nothing is pulled", () => {
    const none = { ...brewTimelineMineral, ingredients: brewTimelineMineral.ingredients.map(row => ({ ...row, packs: "0", loose: "0" })) };
    expect(htmlOf(createElement(BrewTimelineView, { model: none }))).toContain("Confirm no ingredients used");
  });
});

describe("Vessel detail view", () => {
  it("the occupancy row is a link to its batch, not an Open batch verb (#1026)", () => {
    const html = htmlOf(createElement(VesselDetailView, { model: { ...vesselFv3, occupancy: { title: "Stout · BATCH-0168", detail: "13.5 / 15 bbl", href: "/batches/b1" } } }));
    expect(html).toMatch(/<a[^>]*href="\/batches\/b1"[^>]*>(?:(?!<\/a>)[\s\S])*Stout · BATCH-0168/);
    expect(html).not.toMatch(/Open batch/);
    expect(src("app/(app)/cellar/vessels/[id]/page.tsx")).not.toMatch(/Open batch/);
  });

  it("a vessel not saved yet shows only its facts: no occupancy or readings (#1116)", () => {
    const html = htmlOf(createElement(VesselDetailView, { model: vesselNew }));
    for (const gone of ["No open occupancy", "Current reading", "Reading history", "No readings yet"]) expect(html).not.toContain(gone);
    expect(html).toContain("Vessel facts");
    // An existing empty vessel still says it is empty and has no readings.
    const empty = htmlOf(createElement(VesselDetailView, { model: { ...vesselFv3, occupancy: undefined, readings: { current: "No readings yet", history: [] } } }));
    for (const shown of ["No open occupancy", "Current reading", "Reading history"]) expect(empty).toContain(shown);
  });

  it("the New vessel inventory record draws the not-yet-saved vessel with what Save still needs (#1116)", () => {
    const record = screen("New vessel");
    const body = record.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(VesselDetailView);
    expect(body.props.model).toEqual(vesselNew);
    // Like the live page, the capacity starts blank, so no field error is drawn yet.
    const html = htmlOf(record.body);
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toMatch(/<button\b(?=[^>]*\bdisabled)[^>]*>Save vessel<\/button>/);
    expect(screen("Cellar map").to?.["Add vessel"]).toBe("New vessel");
    expect(screen("Batches").to?.["New vessel"]).toBe("New vessel");
  });

  it("the back link names the page it opens: Cellar (#1116)", () => {
    const html = htmlOf(createElement(VesselDetailView, { model: vesselFv3 }));
    expect(html).toMatch(/<a[^>]*>(?:(?!<\/a>)[\s\S])*Cellar<\/a>/);
    // "Cellar map" stays only as the inventory screen it opens (data-to), never as copy.
    expect(html).toContain('data-to="Cellar map"');
    expect(html.replace(/data-to="[^"]*"/g, "")).not.toContain("Cellar map");
  });

  it("a refused New vessel names New vessel, and editing a vessel keeps the incomplete state (#1116)", () => {
    expect(src("app/(app)/cellar/vessels/[id]/page.tsx")).toContain('requirePagePermission(ctx, id === "new" ? "upsert_vessel" : "list_vessels", id === "new" ? "New vessel" : "Vessel detail")');
    expect(screen("Vessel detail").states?.map(([state]) => state)).toContain("incomplete");
  });

  it("the Vessel detail inventory record is VesselDetailView", () => {
    const body = screen("Vessel detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(VesselDetailView);
    expect(body.props.model).toEqual(vesselFv3);
  });

  it("live cellar shares its tiles and links to the vessel page", () => {
    const page = src("app/(app)/cellar/page.tsx");
    expect(page).toMatch(/<CellarMapView\b/);
    expect(page).toMatch(/list_occupancies/);
    expect(src("app/(app)/batches/vessel-form.tsx")).toMatch(/<VesselDetailView\b/);
  });
});

describe("Close packaging run view", () => {
  it("the Close packaging run inventory record is ClosePackagingRunView", () => {
    const body = screen("Close packaging run").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ClosePackagingRunView);
    expect(body.props.model).toEqual(closePackagingRunHazy);
  });

  it("the Run closed inventory record is RunClosedView", () => {
    const body = screen("Run closed").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RunClosedView);
    expect(body.props.model).toEqual(runClosedHazy);
  });

  it("the live packaging run page mounts ClosePackagingRunView and RunClosedView", () => {
    const page = src("app/(app)/packaging/[id]/page.tsx");
    expect(page).toMatch(/<ClosePackagingRunView\b/);
    expect(page).not.toMatch(/\blead=/);
    expect(page).not.toMatch(/\breview=/);
    expect(page).toMatch(/<RunClosedView\b/);
    expect(page).toMatch(/<CloseRunForm\b/);
  });
});

describe("Finished records keep their facts (#1480)", () => {
  it("a closed run shows its brand, source, planned day and closed day", () => {
    const html = htmlOf(createElement(RunClosedView, { model: { ...runClosedHazy, closedAt: "2026-09-06T02:00:00Z", timeZone: "America/New_York" } }));
    expect(html).toMatch(/Brand<[^]*?Hazy IPA/);
    expect(html).toMatch(/Source<[^]*?FV3 · B-0416/);
    expect(html).toMatch(/Planned<[^]*?Sep 4, 2026/);
    // closed_at is an instant: 02:00 UTC on Sep 6 is still Sep 5 in New York.
    expect(html).toMatch(/Closed<[^]*?Sep 5, 2026/);
  });

  it("a record with no packaging materials is one line, and offers no correction", () => {
    const empty = { ...runClosedHazy.records![0]!, planned: [], actuals: [] };
    expect(hasPackagingMaterials(empty)).toBe(false);
    expect(hasPackagingMaterials(runClosedHazy.records![0]!)).toBe(true);
    const html = htmlOf(createElement(RunClosedView, { model: { ...runClosedHazy, records: [empty], correction: undefined } }));
    expect(html).toContain("No packaging materials.");
    expect(html).not.toContain("Planned material");
    expect(src("app/(app)/packaging/[id]/page.tsx")).toMatch(/latest && hasPackagingMaterials\(latest\)/);
  });

  it("a completed batch says when it completed and what it wrote off, not that cellar work continues", () => {
    const completed = htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, recorded: true, completion: { on: "Oct 26, 2026", writeOffBbl: 1.25, packagedBbl: 8.75 } } }));
    expect(completed).toMatch(/Completed<[^]*?Oct 26, 2026/);
    expect(completed).toMatch(/Packaged<[^]*?8.75 bbl/);
    expect(completed).toMatch(/Written off as loss<[^]*?1.25 bbl/);
    expect(completed).not.toContain("Already brewed.");
    const belowThreshold = htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, recorded: true, completion: { on: "Oct 26, 2026", writeOffBbl: null, packagedBbl: 0 } } }));
    expect(belowThreshold).toMatch(/Written off as loss<[^]*?None/);
    expect(htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, recorded: true } }))).toContain("Already brewed.");
  });

  it("the brew sheet names the recipe with its pinned version", () => {
    const html = htmlOf(createElement(BrewDayView, { model: { ...brewDayHazy, plan: { ...brewDayHazy.plan, recipe: "Hazy IPA", version: { version: 4 } } } }));
    expect(html).toMatch(/Recipe<[^]*?Hazy IPA v4/);
  });
});

describe("Recipes view", () => {
  it("the Recipes inventory record is RecipesView", () => {
    const body = screen("Recipes").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RecipesView);
    expect(body.props.model).toEqual(toRecipesViewProps(recipesList));
  });

  it("maps live list_recipes onto Recipe, Version and Brand columns, without inventing a style", () => {
    const model = toRecipesViewProps({
      recipes: [
        { id: "r1", name: "Hazy IPA", brand: null, latest_version: 1 },
        { id: "r2", name: "Stout", brand: "Stout", latest_version: null },
      ],
    });
    expect(model.rows[0]).toEqual({ key: "r1", name: "Hazy IPA", version: 1, brand: null, href: "/recipes/r1" });
    expect(model.rows[1]).toEqual({ key: "r2", name: "Stout", version: null, brand: "Stout", href: "/recipes/r2" });
    const html = htmlOf(createElement(RecipesView, { model, linkRows: true }));
    expect(html).toContain('href="/recipes/r1"');
    expect(html).toContain('href="/recipes/r2"');
    expect(html).not.toContain(">Open<");
  });

  // #1516 item 8: the shared RecordTable, one line per recipe on the desk.
  it("draws the recipes through RecordTable, a missing version in the warning style", () => {
    const html = htmlOf(createElement(RecipesView, { model: toRecipesViewProps(recipesList) }));
    expect(html).toContain("<table");
    for (const header of ["Recipe", "Version", "Brand"]) expect(html).toMatch(new RegExp(`<th[^>]*>[\\s\\S]*?${header}[\\s\\S]*?</th>`));
    expect(html).toContain(">v4<");
    expect(html).toMatch(/class="text-warning-foreground"[^>]*>No version yet</);
    expect(html).toContain("No brand yet");
    expect(html).toMatch(/data-to="Recipe"[^>]*>Farmhouse saison</);
  });

  it("links Water profiles, the catalog a version picks its water from (#1140, #1205)", () => {
    const live = htmlOf(createElement(RecipesView, { model: toRecipesViewProps({ recipes: [], waterProfilesHref: "/catalog/water-profiles" }) }));
    expect(live).toMatch(/<a[^>]*href="\/catalog\/water-profiles"[^>]*>[^]*?Water profiles/);
    expect(live).toContain("Manage water profiles");
    expect(live).not.toMatch(/source and target/i);
    // The inventory frame leaves the row for the explorer, which walks it to the Water profiles record.
    expect(htmlOf(screen("Recipes").body)).toContain("Water profiles");
    expect(resolveTap(screen("Recipes"), "Water profiles")).toBe("Water profiles");
    // The renamed create row still opens the Ingredient record, not the global inert list.
    expect(resolveTap(screen("Recipe"), "Add ingredient")).toBe("Ingredient");
  });

  it("draws the inventory list through the live adapter, a recipe with no version included", () => {
    const { rows } = toRecipesViewProps(recipesList);
    expect(rows.map((r) => r.brand)).toEqual(["Hazy IPA", "Pils", null]);
    expect(rows[2]).toMatchObject({ name: "Farmhouse saison", version: null });
    expect(htmlOf(screen("Recipes").body)).not.toMatch(/15 bbl · updated/);
  });


  it("the live Recipes page mounts RecipesView and links New recipe to /recipes/new", () => {
    const page = src("app/(app)/recipes/page.tsx");
    expect(page).toMatch(/<RecipesView\b/);
    expect(page).toMatch(/\/recipes\/new/);
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<RecipeEditor\b/);
  });

  it("the Recipe inventory record is RecipeView", () => {
    const body = screen("Recipe").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RecipeView);
    expect(body.props.model).toEqual(recipeHazyV4);
  });

  it("renders recipe numbers in one compact responsive grid without React key warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = htmlOf(createElement(RecipeView, { model: recipeHazyV4 }));
    const errors = error.mock.calls.flat().join(" ");
    error.mockRestore();

    expect(errors).not.toContain('unique "key" prop');
    expect(html.match(/grid-cols-2 md:grid-cols-4/g)).toHaveLength(1);
  });

  it("the live recipe page mounts RecipeView; its next version is RecipeEditor on ./new", () => {
    expect(src("app/(app)/recipes/[id]/page.tsx")).toMatch(/<RecipeView\b/);
    expect(src("app/(app)/recipes/[id]/new/page.tsx")).toMatch(/<RecipeEditor\b/);
  });
});

it("only offers the cellar Reading shortcut when one tank could be meant", () => {
  // The map draws a single Reading button. With more than one tank occupied
  // there is no unambiguous target, and guessing records a fermentation
  // reading against the wrong occupancy; the tile opens the right tank.
  const vessels = [{ id: "v1", name: "FV1", capacity_bbl: 10 }, { id: "v2", name: "FV2", capacity_bbl: 10 }];
  const one = [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, bbl: 2 }];
  const two = [...one, { vessel_id: "v2", occupancy_id: "o2", brand_name: null, bbl: 3 }];
  const reading = (occupancyId: string) => `/cellar/${occupancyId}/reading`;
  expect(toCellarMapViewProps(vessels, one, {}, {}, reading).readingHref).toBe("/cellar/o1/reading");
  expect(toCellarMapViewProps(vessels, two, {}, {}, reading).readingHref).toBeNull();
  expect(toCellarMapViewProps(vessels, [], {}, {}, reading).readingHref).toBeNull();
  // Without a caller-supplied path the adapter invents none.
  expect(toCellarMapViewProps(vessels, one).readingHref).toBeUndefined();
});

it("explains a disabled cellar Reading instead of leaving a dead end (#715)", () => {
  const vessels = [{ id: "v1", name: "FV1", capacity_bbl: 10 }, { id: "v2", name: "FV2", capacity_bbl: 10 }];
  const one = [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, bbl: 2 }];
  const two = [...one, { vessel_id: "v2", occupancy_id: "o2", brand_name: null, bbl: 3 }];
  const reading = (occupancyId: string) => `/cellar/${occupancyId}/reading`;
  expect(toCellarMapViewProps(vessels, one, {}, {}, reading).actionHint).toBeUndefined();
  expect(toCellarMapViewProps(vessels, two, {}, {}, reading).actionHint).toBe("Several tanks hold beer. Use Reading on a tank.");
  // #1115: Transfer and Addition are off for the same reason, so the one note names all three.
  expect(toCellarMapViewProps(vessels, [], {}, {}, reading).actionHint).toBe("No tank holds beer, so there is nothing to read, transfer or add to.");
  const html = htmlOf(createElement(CellarMapView, { model: toCellarMapViewProps(vessels, two, {}, { v1: "/cellar/vessels/v1" }, reading) }));
  expect(html).toContain("Use Reading on a tank.");
  // The top Reading stays unbound; each tile carries its own (#1508).
  expect(html).not.toMatch(/<a[^>]*href="\/cellar\/o\d\/reading"[^>]*>Reading<\/a>\s*<button/);
});

// #994: an empty search is not an empty recipe book.
describe("Recipes search", () => {
  it("says no recipes match, not no recipes yet, when a search is on", () => {
    expect(toRecipesViewProps({ recipes: [], filtered: true }).empty).toEqual({ title: "No recipes match", description: "Clear the search to see every recipe." });
    expect(toRecipesViewProps({ recipes: [] }).empty?.title).toBe("No recipes yet");
  });
});

describe("cellar readings (#700)", () => {
  it("formats each open occupancy's latest reading from one list_batches read", () => {
    const reading = { id: "r1", at: "2026-09-01T15:00:00Z", temp_f: 66, gravity_plato: 4.5, ph: null, note: null };
    const readings = cellarReadings([
      { active_occupancies: [{ id: "o1", latest_reading: reading }, { id: "o2", latest_reading: null }] },
      { active_occupancies: [] },
    ], "plato", "UTC");
    expect(Object.keys(readings)).toEqual(["o1", "o2"]);
    expect(readings.o1).toContain("2026");
    expect(readings.o2).toBe("No readings yet");
  });

  it("the cellar page asks list_batches for readings instead of one call per occupancy", () => {
    const page = readFileSync("app/(app)/cellar/page.tsx", "utf8");
    expect(page).not.toContain("list_fermentation_readings");
    // #759: and only the open batches, so the row cap is never spent on finished ones.
    expect(page).toContain('runCommand("list_batches", { readings: true, open: true }, ctx)');
  });
});

// #1115: a field standing alone in a cellar sheet names itself on screen, not only to a screen reader.
const labelled = (html: string, text: string) => {
  const forId = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${text}</label>`).exec(html)?.[1];
  return Boolean(forId) && new RegExp(`<input[^>]*id="${forId}"`).test(html);
};

// A single-choice chip group (Radix renders role="radiogroup") is named by its visible heading.
const headed = (html: string, text: string) => {
  const id = new RegExp(`<label[^>]*id="([^"]+)"[^>]*>${text}</label>`).exec(html)?.[1];
  return Boolean(id) && new RegExp(`role="radiogroup"[^>]*aria-labelledby="${id}"|aria-labelledby="${id}"[^>]*role="radiogroup"`).test(html);
};
// A picker's help line is tied to it: the trigger's aria-describedby is the line's id.
const described = (html: string, text: string) => {
  const id = new RegExp(`<p[^>]*id="([^"]+)"[^>]*>${text}</p>`).exec(html)?.[1];
  return Boolean(id) && html.includes(`aria-describedby="${id}"`);
};

describe("cellar sheets label every field (#1115)", () => {
  it("transfer shows Barrels moving, explains From and To, and heads the remainder choice", () => {
    const html = htmlOf(createElement(CellarTransferView, { model: cellarTransferPils, footer: null }));
    expect(labelled(html, "Barrels moving")).toBe(true);
    expect(headed(html, "What happens to the remainder")).toBe(true);
    expect(described(html, "The tank the beer leaves.")).toBe(true);
    expect(described(html, "The tank the beer goes into. One that already holds beer is a blend.")).toBe(true);
  });

  it("addition shows Quantity and Title Case stage chips under a Stage heading", () => {
    const html = htmlOf(createElement(CellarAdditionView, { model: cellarAdditionCitra, footer: null }));
    expect(labelled(html, "Quantity")).toBe(true);
    expect(headed(html, "Stage")).toBe(true);
    for (const chip of ["Dry hop", "Fermentation", "Other"]) expect(html).toMatch(new RegExp(`>${chip}</button>`));
  });

  it("addition says what is still needed only beside its button, never as an amber warning", () => {
    const html = htmlOf(createElement(CellarAdditionView, { model: { ...cellarAdditionCitra, occupancyId: "" }, footer: null }));
    expect(html).not.toContain("Still needed");
    expect(html).not.toContain("bg-warning");
    // Over what the lot holds is a real error, so it stays amber.
    expect(htmlOf(createElement(CellarAdditionView, { model: { ...cellarAdditionCitra, qty: "41" }, footer: null }))).toMatch(/bg-warning[\s\S]*Only 40 lb of L-0790 on hand/);
  });

  it("with no beer in any tank, all three actions are off under one note, even without a reading path", () => {
    const vessels = [{ id: "v1", name: "FV1", capacity_bbl: 10 }];
    const empty = toCellarMapViewProps(vessels, []);
    expect(empty.actionsOff).toBe(true);
    expect(empty.actionHint).toBe("No tank holds beer, so there is nothing to read, transfer or add to.");
    expect(toCellarMapViewProps(vessels, [{ vessel_id: "v1", occupancy_id: "o1", brand_name: null, bbl: 2 }]).actionsOff).toBe(false);
    const html = htmlOf(createElement(CellarMapView, { model: empty }));
    for (const verb of ["Reading", "Transfer", "Addition"]) expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${verb}</button>`));
    expect(html).toContain("nothing to read, transfer or add to");
  });

  it("draws Brew day as a link to Batches, not as a peer action button", () => {
    const model = { ...toCellarMapViewProps([{ id: "v1", name: "FV1", capacity_bbl: 10 }], []), brewHref: "/batches" };
    const html = htmlOf(createElement(CellarMapView, { model }));
    expect(html).toMatch(/<a[^>]*href="\/batches"[^>]*>Start a brew day in Batches<\/a>/);
    expect(html).not.toMatch(/data-slot="button"[^>]*href="\/batches"/);
  });
});
