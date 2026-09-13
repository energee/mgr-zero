import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeeklyCountDraftView, WeeklyCountView } from "../components/mgr/views/weekly-count";
import { weeklyCount } from "../lib/mgr/fixtures/taproom";
import { readFileSync } from "node:fs";
import { countDraftFromSnapshot, updateCountQuantity, beginCountAttempt, failCountAttempt } from "../lib/mgr/taproom-count-state";

it("freezes the shared bucket controls while keeping exact retry available", () => {
  let state = countDraftFromSnapshot({ location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [{ bin_id: "cold", bin_name: "Cold", sku_id: "keg", sku_name: "Actual keg", brand_id: "brand", brand_name: "Actual brand", bbl_per_unit: 0.5, lot_id: "private-lot-id", qty_before: 3 }] }, { prior_count: null, expected_bbl: null, reason: "no_pos_coverage", rows: [] });
  state = updateCountQuantity(state, state.draft.lines[0].key, "2");
  state = failCountAttempt(beginCountAttempt(state, "frozen-request"), "unknown", "No response");
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state, role: "taproom", lotLabels: {} }));
  expect(html).toContain("Retry unchanged count");
  expect(html).toContain("disabled");
  expect(html).toContain("worksheet row 1");
  expect(html).not.toContain("private-lot-id");
  expect(html).not.toContain('href="/taproom');
});

it("keeps correction permission and explicit slot suppression in the shared page", () => {
  const render = (role: "admin" | "warehouse") => renderToStaticMarkup(createElement(WeeklyCountView, { model: { ...weeklyCount, role }, draft: null }));
  expect(render("admin")).toContain("Correct count");
  expect(render("warehouse")).not.toContain("Correct count");
  expect(render("admin")).not.toContain("Record count");
  expect(render("admin")).toContain("Open count");
});

it("the live draft, correction and print bindings delegate to shared controls", () => {
  const source = readFileSync("app/(app)/taproom/count-form.tsx", "utf8");
  expect(source).toContain("return <WeeklyCountDraftView");
  expect(source).toContain("return <WeeklyCountCorrectionView");
  expect(source).toContain("<WeeklyCountPrintAction");
  expect(source).not.toContain("<Input");
  expect(source).not.toContain("<form");
});
