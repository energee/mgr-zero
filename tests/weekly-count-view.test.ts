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
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state, roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  expect(html).toContain("Retry unchanged count");
  expect(html).toContain("disabled");
  expect(html).toContain("worksheet row 1");
  expect(html).not.toContain("private-lot-id");
  expect(html).not.toContain('href="/taproom');
});

it("keeps correction permission and explicit slot suppression in the shared page", () => {
  const render = (role: "admin" | "warehouse") => renderToStaticMarkup(createElement(WeeklyCountView, { model: { ...weeklyCount, roles: [role] }, draft: null }));
  expect(render("admin")).toContain("Correct count");
  expect(render("warehouse")).not.toContain("Correct count");
  expect(render("admin")).not.toContain("Record count");
  expect(render("admin")).not.toContain("Open count");
});

it("a saved count in the history is a row link to that count, not an Open count verb (#1026)", () => {
  const history = [{ ...weeklyCount.history[0]!, href: "/taproom/count/sep1" }];
  const html = renderToStaticMarkup(createElement(WeeklyCountView, { model: { ...weeklyCount, history }, draft: null }));
  expect(html).toMatch(/<a[^>]*href="\/taproom\/count\/sep1"[^>]*>(?:(?!<\/a>)[\s\S])*Weekly count · Sep 1, 2026/);
  expect(html).not.toContain("Open count");
});

it("the live draft, correction and print bindings delegate to shared controls", () => {
  const source = readFileSync("app/(app)/taproom/count-form.tsx", "utf8");
  expect(source).toContain("return <WeeklyCountDraftView");
  expect(source).toContain("return <WeeklyCountCorrectionView");
  expect(source).toContain("<WeeklyCountPrintAction");
  expect(source).not.toContain("<Input");
  expect(source).not.toContain("<form");
});

it("marks the count quantities invalid when the save was rejected", () => {
  // The error message alone is not announced as belonging to the inputs; a
  // screen reader needs the fields themselves flagged (this was lost when the
  // live form's per-input aria-invalid moved into the shared control).
  let state = countDraftFromSnapshot({ location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [{ bin_id: "cold", bin_name: "Cold", sku_id: "keg", sku_name: "Actual keg", brand_id: "brand", brand_name: "Actual brand", bbl_per_unit: 0.5, lot_id: "lot", qty_before: 3 }] }, { prior_count: null, expected_bbl: null, reason: "no_pos_coverage", rows: [] });
  state = updateCountQuantity(state, state.draft.lines[0].key, "2");
  const ok = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state, roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  expect(ok).not.toContain('aria-invalid="true"');
  const rejected = failCountAttempt(beginCountAttempt(state, "request"), "error", "Bin no longer holds that lot");
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state: rejected, roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  expect(html).toContain('aria-invalid="true"');
});

it("#1117 draws routine guidance as neutral help, never the amber warning note", () => {
  const html = renderToStaticMarkup(createElement(WeeklyCountView, { model: weeklyCount, draft: null }));
  expect(html).toContain("Latest uncorrected count");
  expect(html).toContain("Only Admin can correct a count");
  expect(html).not.toContain("without the action");
  expect(html).not.toContain("bg-warning");
});

it("#1117 says in plain words why expected consumption is unavailable", () => {
  const empty = { location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [] };
  const render = (reason: string) => renderToStaticMarkup(createElement(WeeklyCountDraftView, { state: countDraftFromSnapshot(empty, { prior_count: null, expected_bbl: null, reason, rows: [] }), roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  const first = render("missing_baseline");
  expect(first).toContain("Expected consumption unavailable. This is the first count, so there is nothing to compare against yet.");
  expect(first).not.toContain("missing baseline");
  expect(render("unmapped_pos_lines")).toContain("Some POS items still need mapping.");
});

it("#1117 draws Refresh expected and Print current stock labels as visible buttons", () => {
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state: countDraftFromSnapshot({ location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [] }, null), roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  for (const label of ["Refresh expected", "Print current stock labels"]) expect(html).toMatch(new RegExp(`<button[^>]*data-variant="outline"[^>]*>${label}</button>`));
});

it("#1117 explains that recording a taproom with no stock saves a zero count", () => {
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state: countDraftFromSnapshot({ location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [] }, null), roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  expect(html).toContain("Record count saves that nothing is on hand");
  expect(html).not.toContain("empty observation");
  expect(html).toContain("Record count");
});

it("#814 shows the shared shortage disposition picker and freezes it on uncertain retry", () => {
  let state = countDraftFromSnapshot({ location_id: "taproom", counted_on: "2026-09-12", prior_count: null, revision: "captured", lines: [{ bin_id: "cold", bin_name: "Cold", sku_id: "keg", sku_name: "Keg", brand_id: "brand", brand_name: "Brand", bbl_per_unit: .5, lot_id: null, qty_before: 3 }] }, null);
  state = updateCountQuantity(state, state.draft.lines[0].key, "2");
  const html = renderToStaticMarkup(createElement(WeeklyCountDraftView, { state, roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }));
  expect(html).toContain("Shortage disposition");
  expect(html).toContain("Sold");
  const frozen = failCountAttempt(beginCountAttempt(state, "request"), "unknown", "No response");
  expect(renderToStaticMarkup(createElement(WeeklyCountDraftView, { state: frozen, roles: ["taproom"], lotLabels: {}, timeZone: "America/New_York" }))).toContain('data-disabled');
});
