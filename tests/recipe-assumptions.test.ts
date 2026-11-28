// tests/recipe-assumptions.test.ts — pins suggestAssumptions against the rule
// table in docs/plans/derived-assumptions.md ("How a suggestion is chosen" and
// "What the screen says"): which batches each rule compares, the median, and the
// sentence the Recipe numbers sheet shows. Then which of those the sheet offers
// (assumptionSuggestions: only a number that differs from the field) and that
// the sheet draws the line with its Use button. Pure; no DB.
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeNumbersView } from "../components/mgr/views/recipe-numbers";
import { assumptionSuggestions, type BatchMeasurement, suggestAssumptions } from "../lib/mgr/recipe-assumptions";

let next = 0;
/** A batch on grain bill "g1", yeast "y1", mashed at 152 °F, that measured 74% efficiency and 80% attenuation. */
const batch = (overrides: Partial<BatchMeasurement> = {}): BatchMeasurement => ({
  batchId: `b${++next}`,
  batchNo: next,
  brewedOn: "2026-10-01",
  gristKey: "g1",
  yeastIds: ["y1"],
  mashRestF: 152,
  brewhouseEfficiency: 0.74,
  apparentAttenuation: 0.8,
  ...overrides,
});

const sheet = { gristKey: "g1", yeastIds: ["y1"], mashRestF: 152 };

describe("suggestAssumptions efficiency", () => {
  it("rule 1: batches on the same grain bill", () => {
    const history = [batch({ brewhouseEfficiency: 0.7 }), batch({ brewhouseEfficiency: 0.72 }), batch({ gristKey: "g2", brewhouseEfficiency: 0.9 })];
    expect(suggestAssumptions(sheet, history).efficiency).toEqual({
      percent: 71, batches: 2, text: "2 batches on this grain bill measured 71%.",
    });
  });

  it("rule 2: every batch, when the grain bill has only one valued batch", () => {
    const history = [batch({ brewhouseEfficiency: 0.7 }), batch({ gristKey: "g2", brewhouseEfficiency: 0.8 }), batch({ gristKey: "g3", brewhouseEfficiency: 0.9 })];
    expect(suggestAssumptions(sheet, history).efficiency).toEqual({
      percent: 80, batches: 3, text: "3 batches across the brewery measured 80%.",
    });
  });

  it("an empty grain bill never matches rule 1", () => {
    const history = [batch({ gristKey: "" }), batch({ gristKey: "" })];
    expect(suggestAssumptions({ ...sheet, gristKey: "" }, history).efficiency?.text).toBe("2 batches across the brewery measured 74%.");
  });

  it("a batch with no efficiency is not counted", () => {
    const history = [batch({ brewhouseEfficiency: 0.7 }), batch({ brewhouseEfficiency: null }), batch({ gristKey: "g2", brewhouseEfficiency: 0.8 })];
    expect(suggestAssumptions(sheet, history).efficiency).toEqual({
      percent: 75, batches: 2, text: "2 batches across the brewery measured 75%.",
    });
  });
});

describe("suggestAssumptions attenuation", () => {
  it("rule 1: same grain bill and yeast, mashed within 2 °F", () => {
    const history = [batch({ apparentAttenuation: 0.78 }), batch({ mashRestF: 154, apparentAttenuation: 0.8 }), batch({ mashRestF: 150, apparentAttenuation: 0.82 })];
    expect(suggestAssumptions(sheet, history).attenuation).toEqual({
      percent: 80, batches: 3, text: "3 batches on this grain bill and yeast, mashed near 152 °F, finished at 80%.",
    });
  });

  it("rule 2: same yeast and mash rest on another grain bill", () => {
    const history = [batch({ apparentAttenuation: 0.7 }), batch({ gristKey: "g2", apparentAttenuation: 0.8 })];
    expect(suggestAssumptions(sheet, history).attenuation).toEqual({
      percent: 75, batches: 2, text: "2 batches on this yeast, mashed near 152 °F, finished at 75%.",
    });
  });

  it("rule 3: same yeast at any mash rest", () => {
    const history = [batch({ mashRestF: 160, apparentAttenuation: 0.7 }), batch({ mashRestF: 145, apparentAttenuation: 0.76 })];
    expect(suggestAssumptions(sheet, history).attenuation).toEqual({
      percent: 73, batches: 2, text: "2 batches on this yeast finished at 73%.",
    });
  });

  it("rule 4: every batch, when only one shares the yeast", () => {
    const history = [batch(), batch({ yeastIds: ["y2"], apparentAttenuation: 0.7 }), batch({ yeastIds: ["y3"], apparentAttenuation: 0.9 })];
    expect(suggestAssumptions(sheet, history).attenuation).toEqual({
      percent: 80, batches: 3, text: "3 batches across the brewery finished at 80%.",
    });
  });

  it("shares at least one yeast, not all of them", () => {
    const history = [batch({ yeastIds: ["y9", "y1"] }), batch({ yeastIds: ["y1"] })];
    expect(suggestAssumptions({ ...sheet, yeastIds: ["y1", "y2"] }, history).attenuation?.batches).toBe(2);
    expect(suggestAssumptions({ ...sheet, yeastIds: ["y1", "y2"] }, history).attenuation?.text).toMatch(/^2 batches on this grain bill and yeast/);
  });

  it("mash rests exactly 2 °F apart match; 2.5 °F apart do not", () => {
    const within = [batch({ mashRestF: 154 }), batch({ mashRestF: 150 })];
    expect(suggestAssumptions(sheet, within).attenuation?.text).toMatch(/^2 batches on this grain bill and yeast/);
    const outside = [batch({ mashRestF: 154.5 }), batch({ mashRestF: 149.5 })];
    expect(suggestAssumptions(sheet, outside).attenuation?.text).toBe("2 batches on this yeast finished at 80%.");
  });

  it("a batch with no mash rest never matches the mash-rest rules", () => {
    const history = [batch({ mashRestF: null }), batch({ mashRestF: null })];
    expect(suggestAssumptions(sheet, history).attenuation?.text).toBe("2 batches on this yeast finished at 80%.");
  });

  it("a sheet with no mash rest skips the mash-rest rules", () => {
    const history = [batch(), batch()];
    expect(suggestAssumptions({ ...sheet, mashRestF: null }, history).attenuation?.text).toBe("2 batches on this yeast finished at 80%.");
  });

  it("a sheet with no yeast falls to the brewery rule", () => {
    const history = [batch(), batch()];
    expect(suggestAssumptions({ ...sheet, yeastIds: [] }, history).attenuation?.text).toBe("2 batches across the brewery finished at 80%.");
  });

  it("an empty grain bill never matches rule 1", () => {
    const history = [batch({ gristKey: "" }), batch({ gristKey: "" })];
    expect(suggestAssumptions({ ...sheet, gristKey: "" }, history).attenuation?.text).toBe("2 batches on this yeast, mashed near 152 °F, finished at 80%.");
  });

  it("a batch with no attenuation is not counted and does not count toward N", () => {
    const history = [batch({ apparentAttenuation: 0.7 }), batch({ apparentAttenuation: null }), batch({ apparentAttenuation: 0.8 })];
    expect(suggestAssumptions(sheet, history).attenuation).toEqual({
      percent: 75, batches: 2, text: "2 batches on this grain bill and yeast, mashed near 152 °F, finished at 75%.",
    });
  });
});

describe("suggestAssumptions median", () => {
  it("takes the middle value of an odd count", () => {
    const history = [0.6, 0.9, 0.7].map((e) => batch({ brewhouseEfficiency: e }));
    expect(suggestAssumptions(sheet, history).efficiency?.percent).toBe(70);
  });

  it("takes the mean of the middle two of an even count", () => {
    const history = [0.9, 0.6, 0.7, 0.8].map((e) => batch({ brewhouseEfficiency: e }));
    expect(suggestAssumptions(sheet, history).efficiency?.percent).toBe(75);
  });

  it("rounds the median to a whole percent", () => {
    const history = [0.797, 0.797, 0.797].map((e) => batch({ brewhouseEfficiency: e }));
    expect(suggestAssumptions(sheet, history).efficiency?.percent).toBe(80);
  });
});

describe("suggestAssumptions with too little history", () => {
  it("suggests nothing from an empty history", () => {
    expect(suggestAssumptions(sheet, [])).toEqual({});
  });

  it("suggests nothing from one valued batch", () => {
    expect(suggestAssumptions(sheet, [batch(), batch({ brewhouseEfficiency: null, apparentAttenuation: null })])).toEqual({});
  });
});

describe("assumptionSuggestions", () => {
  const history = [batch({ brewhouseEfficiency: 0.7, apparentAttenuation: 0.79 }), batch({ brewhouseEfficiency: 0.72, apparentAttenuation: 0.81 })];

  it("offers each measured number that differs from the field, with the percent Use fills in", () => {
    expect(assumptionSuggestions(sheet, history, { efficiency: "75", attenuation: "75" })).toEqual({
      efficiency: { text: "2 batches on this grain bill measured 71%.", use: "71" },
      attenuation: { text: "2 batches on this grain bill and yeast, mashed near 152 °F, finished at 80%.", use: "80" },
    });
  });

  it("stays quiet for a field already on the measured number, and offers one for a blank field", () => {
    expect(assumptionSuggestions(sheet, history, { efficiency: "71", attenuation: "" })).toEqual({
      attenuation: { text: "2 batches on this grain bill and yeast, mashed near 152 °F, finished at 80%.", use: "80" },
    });
    expect(assumptionSuggestions(sheet, [], { efficiency: "75", attenuation: "75" })).toEqual({});
  });
});

describe("the Recipe numbers sheet", () => {
  const values = { batchBbl: "22", efficiency: "75", attenuation: "75" };
  const draw = (suggestions?: Parameters<typeof RecipeNumbersView>[0]["suggestions"]) =>
    renderToStaticMarkup(createElement(RecipeNumbersView, { values, suggestions })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("draws a suggestion under its field with a Use button, and nothing without one", () => {
    const drawn = draw({ attenuation: { text: "3 batches on this yeast finished at 80%.", use: "80" } });
    expect(drawn).toContain("3 batches on this yeast finished at 80%.");
    expect(drawn).toContain("Use 80%");
    expect(draw()).not.toContain("Use ");
  });
});
