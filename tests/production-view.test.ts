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
import { toBatchesViewProps } from "../lib/mgr/batches-view";
import { toBrewDayViewProps } from "../lib/mgr/brew-day-view";
import { toClosePackagingRunViewProps } from "../lib/mgr/close-packaging-run-view";
import { toRecipeViewProps } from "../lib/mgr/recipe-view";
import { toRecipesViewProps } from "../lib/mgr/recipes-view";
import { toRunClosedViewProps } from "../lib/mgr/run-closed-view";
import { toScheduleBatchViewProps } from "../lib/mgr/schedule-batch-view";
import { toVesselDetailViewProps } from "../lib/mgr/vessel-detail-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Batches view", () => {
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
    expect(page).toMatch(/className="self-start"><VesselForm \/>/);
    expect(page).toMatch(/<NewBatchForm\b/);
    expect(page).not.toMatch(/ScheduleBatchView/);
  });
});

describe("Schedule batch view", () => {
  it("the Schedule batch inventory record is ScheduleBatchView", () => {
    const body = screen("Schedule batch").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ScheduleBatchView);
    expect(body.props.model).toEqual(toScheduleBatchViewProps(scheduleBatchHazy));
  });

  it("renders Save schedule without leaking live hrefs", () => {
    const html = htmlOf(createElement(ScheduleBatchView, { model: toScheduleBatchViewProps(scheduleBatchHazy) }));
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
  it("the Brew day inventory record is BrewDayView", () => {
    const body = screen("Brew day").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrewDayView);
    expect(body.props.model).toEqual(toBrewDayViewProps(brewDayHazy));
  });

  it("renders Record brew day and knockout", () => {
    const html = htmlOf(createElement(BrewDayView, { model: toBrewDayViewProps(brewDayHazy) }));
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
    expect(body.props.model).toEqual(toVesselDetailViewProps(vesselFv3));
  });

  it("live cellar stays the occupancy list", () => {
    const page = src("app/(app)/cellar/page.tsx");
    expect(page).not.toMatch(/VesselDetailView/);
    expect(page).toMatch(/list_occupancies/);
  });
});

describe("Close packaging run view", () => {
  it("the Close packaging run inventory record is ClosePackagingRunView", () => {
    const body = screen("Close packaging run").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ClosePackagingRunView);
    expect(body.props.model).toEqual(toClosePackagingRunViewProps(closePackagingRunHazy));
  });

  it("the Run closed inventory record is RunClosedView", () => {
    const body = screen("Run closed").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RunClosedView);
    expect(body.props.model).toEqual(toRunClosedViewProps(runClosedHazy));
  });

  it("the live packaging run page mounts ClosePackagingRunView and RunClosedView", () => {
    const page = src("app/(app)/packaging/[id]/page.tsx");
    expect(page).toMatch(/<ClosePackagingRunView\b/);
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
  });

  it("the live Recipes page mounts RecipesView and slots NewRecipeForm", () => {
    const page = src("app/(app)/recipes/page.tsx");
    expect(page).toMatch(/<RecipesView\b/);
    expect(page).toMatch(/<NewRecipeForm\b/);
  });

  it("the Recipe inventory record is RecipeView", () => {
    const body = screen("Recipe").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(RecipeView);
    expect(body.props.model).toEqual(toRecipeViewProps(recipeHazyV4));
  });

  it("renders recipe numbers in one compact responsive grid without React key warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = htmlOf(createElement(RecipeView, { model: toRecipeViewProps(recipeHazyV4) }));
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
