// tests/production-view.test.ts — Batches, Brew day, packaging close, and
// recipe adapters plus HTML. Views own no sample data. Live NewBatchForm /
// RecordBrewDayForm / CloseRunForm / NewRecipeForm stay wrappers.
import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BatchesView } from "../components/mgr/views/batches";
import { BrewDayView } from "../components/mgr/views/brew-day";
import { ClosePackagingRunView } from "../components/mgr/views/close-packaging-run";
import { RecipeView } from "../components/mgr/views/recipe";
import { RecipesView } from "../components/mgr/views/recipes";
import { RunClosedView } from "../components/mgr/views/run-closed";
import { ScheduleBatchView } from "../components/mgr/views/schedule-batch";
import { VesselDetailView } from "../components/mgr/views/vessel-detail";
import {
  batchesBrewer, brewDayHazy, closePackagingRunHazy, recipeHazyV4, recipesList,
  runClosedHazy, scheduleBatchHazy, vesselFv3,
} from "../lib/mgr/fixtures/production";
import { toBatchesViewProps, batchesFromQuery, type BatchListRow } from "../lib/mgr/batches-view";
import { canRecordBrewDay } from "../lib/mgr/brew-day-view";
import { toRecipesViewProps } from "../lib/mgr/recipes-view";
import { formatVesselReading } from "../lib/mgr/vessel-detail-view";
import { toCellarMapViewProps } from "../lib/mgr/cellar-map-view";
import { CellarMapView } from "../components/mgr/views/cellar-map";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
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

it("vessel readings preserve optional measurements and do not invent actors", () => {
  const reading = { id: "r1", at: "2026-09-12", temp_f: 68, gravity_plato: null, ph: null, note: null };
  expect(formatVesselReading(reading, "plato")).toBe("68 °F");
  const html = htmlOf(createElement(VesselDetailView, { model: { ...vesselFv3, occupancy: undefined, history: [{ key: "r1", title: reading.at, detail: "68 °F" }] }, submitting: true, messages: "Save failed", footer: null }));
  expect(html).toContain("No open occupancy");
  expect(html).toContain("Save failed");
  expect(html).toContain("disabled");
  expect(html).not.toContain("Save vessel");
  expect(html).not.toContain("Dana");
});

describe("Batches view", () => {
  it("groups returned lifecycle facts without inventing readings or hiding closed batches", () => {
    const base: BatchListRow = { id: "planned", batch_no: null, planned_on: "2026-09-12", planned_bbl: 12.5, brewed_on: null, closed_at: null, brand_name: null, recipe_name: null, vessel_name: null };
    expect(batchesFromQuery([base], []).planned?.[0].href).toBeUndefined();
    const model = toBatchesViewProps(batchesFromQuery([base, { ...base, id: "active", brewed_on: "2026-09-12", vessel_name: "Actual tank" }, { ...base, id: "closed", brewed_on: "2026-09-11", closed_at: "2026-09-12" }], [], { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}` }));
    expect(model.planned[0]).toMatchObject({ verb: "Brew", href: "/batches/planned" });
    expect(model.active[0]).toMatchObject({ verb: "Open", href: "/batches/active" });
    expect(model.completed?.[0].key).toBe("closed");
    const html = htmlOf(createElement(BatchesView, { model, workHrefs: { all: "/work", batches: "/batches" }, newVesselHref: "/cellar/vessels/new" }));
    for (const text of ["Planned", "Active", "Completed", "Reading details unavailable", "Actual tank", "12.5 bbl", "No vessels yet"]) expect(html).toContain(text);
    expect(html).not.toContain("°P");
    expect(html).toContain('href="/batches"');
    expect(html).not.toContain('href="/orders"');
  });
  it("does not allow live JSX to replace the planned and active lists", () => {
    const page = src("app/(app)/batches/page.tsx");
    expect(page).not.toMatch(/\blist=|\bfooter=|tabs=\{null\}/);
  });
  it("maps planned Start and overdue Reading", () => {
    const model = toBatchesViewProps(batchesBrewer);
    expect(model.planned[0]?.verb).toBe("Start");
    expect(model.active[1]?.warning).toBe(true);
    expect(model.workChipIndex).toBe(3);
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

describe("Schedule batch view", () => {
  it("the Schedule batch inventory record is ScheduleBatchView", () => {
    const body = screen("Schedule batch").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ScheduleBatchView);
    expect(body.props.model).toEqual(scheduleBatchHazy);
  });

  it("renders Save schedule without leaking live hrefs", () => {
    const html = htmlOf(createElement(ScheduleBatchView, { model: scheduleBatchHazy }));
    expect(html).toMatch(/>Save schedule</);
    expect(html).not.toMatch(/href="\/batches"/);
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
  it("retains knockout inputs and command errors while pending", () => {
    const html = htmlOf(createElement(BrewDayView, { model: brewDayHazy, busy: true, error: "Vessel occupied" }));
    expect(html).toContain("Vessel occupied");
    expect(html).toContain('value="14.6"');
    expect(html).toContain("September 4, 2026");
    expect(html).toContain("disabled");
    expect(html).toContain("Material consumption unavailable");
    expect(html).not.toContain('href="/');
  });
  it("does not substitute a separate live form for the brew-day screen", () => {
    expect(src("app/(app)/batches/[id]/record-brew-day-form.tsx")).toContain("<BrewDayView");
    expect(src("app/(app)/batches/[id]/record-brew-day-form.tsx")).not.toMatch(/<Input\b|<Label\b|<Select\b/);
    expect(src("app/(app)/batches/[id]/page.tsx")).not.toMatch(/\bbody=/);
  });
  it("the Brew day inventory record is BrewDayView", () => {
    const body = screen("Brew day").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrewDayView);
    expect(body.props.model).toEqual(brewDayHazy);
  });

  it("renders Record brew day and knockout", () => {
    const html = htmlOf(createElement(BrewDayView, { model: brewDayHazy }));
    expect(html).toMatch(/>Record brew day</);
    expect(html).toMatch(/14\.6 bbl/);
    expect(html).toMatch(/FV2/);
  });

  it("the live batch page mounts BrewDayView and slots RecordBrewDayForm", () => {
    const page = src("app/(app)/batches/[id]/page.tsx");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/brew-day"/);
    expect(page).toMatch(/<BrewDayView\b/);
    expect(page).toMatch(/<RecordBrewDayForm\b/);
  });
});

describe("Vessel detail view", () => {
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

describe("Recipes view", () => {
  it("the Recipes inventory record is RecipesView", () => {
    const body = screen("Recipes").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RecipesView);
    expect(body.props.model).toEqual(toRecipesViewProps(recipesList));
  });

  it("maps live list_recipes onto Open rows without inventing a style", () => {
    const model = toRecipesViewProps({ recipes: [{ id: "r1", name: "Hazy IPA", brand: null }] });
    expect(model.rows[0]).toMatchObject({ title: "Hazy IPA", detail: "no brand yet", verb: "Open", href: "/recipes/r1" });
    expect(htmlOf(createElement(RecipesView, { model }))).toContain('href="/recipes/r1"');
  });

  it("the live Recipes page mounts RecipesView and links Create recipe to New recipe", () => {
    const page = src("app/(app)/recipes/page.tsx");
    expect(page).toMatch(/<RecipesView\b/);
    expect(page).toMatch(/\/recipes\/new/);
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<NewVersionForm\b/);
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

  it("the live recipe page mounts RecipeView and slots NewVersionForm", () => {
    const page = src("app/(app)/recipes/[id]/page.tsx");
    expect(page).toMatch(/<RecipeView\b/);
    expect(page).toMatch(/<NewVersionForm\b/);
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
