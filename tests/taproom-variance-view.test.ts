import { expect, it } from "vitest";
import { varianceBbl, varianceReason } from "../lib/mgr/taproom-variance-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaproomVarianceView } from "../components/mgr/views/taproom-variance";
import { taproomVariance } from "../lib/mgr/fixtures/taproom";

it("keeps unavailable variance distinct from measured zero and labels incomplete comparisons", () => {
  expect(varianceBbl(null)).toBe("—");
  expect(varianceBbl(0)).toBe("0 bbl");
  expect(varianceBbl(-0.5)).toBe("-0.5 bbl");
});

it("#1117 names every reason the draft projection and the report return in plain words", () => {
  expect(varianceReason("missing_baseline")).toBe("First count, so there is nothing to compare against");
  expect(varianceReason("no_pos_coverage")).toBe("No usable POS sales data covers this period");
  expect(varianceReason("incomplete_pos_coverage")).toBe("POS sales data covers only part of this period");
  expect(varianceReason("unmapped_pos_lines")).toBe("Some POS items still need mapping");
  expect(varianceReason(null)).toBe("Comparable");
});

it("preserves nulls, coverage, exclusions and absent trends in the shared report", () => {
  const report = taproomVariance.report!;
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { weeks: 4, timeZone: "America/New_York", report: { ...report, rows: [{ ...report.rows[0], expected_bbl: null, variance_bbl: null, excluded_bbl: 2, unattributed_bbl: 1 }], periods: [{ ...report.periods[0], expected_bbl: null, coverage_complete: false, unmapped_lines: 3 }] } } }));
  expect(html).toContain("2 bbl excluded outside inventory");
  expect(html).toContain("Completed count endings Aug 12, 2026 through Sep 8, 2026");
  expect(html).toContain("Count Sep 8, 2026");
  expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}(?![T\d:])/);
  expect(html).toContain("1 bbl unattributed");
  expect(html).toContain("coverage incomplete");
  expect(html).toContain("3 unmapped POS lines");
  expect(html).toContain("variance —");
  // No trend yet: the placeholder is hidden, not drawn locked (#1481).
  expect(html).not.toContain("Recurring brand trend");
  expect(html).not.toContain("Not available yet.");
  expect(html).not.toContain("short 4 weeks running");
  expect(html).not.toContain('href="/taproom');
});

it("#814 displays destruction separately from sold actual", () => {
  const report = taproomVariance.report!;
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { ...taproomVariance,
    report: { ...report, rows: [{ ...report.rows[0], destroyed_bbl: 2 }], periods: [{ ...report.periods[0], destroyed_bbl: 2 }] } } }));
  expect(html).toContain("Destroyed");
  expect(html).toContain("destroyed 2 bbl");
});

it("#1118 shows one empty state when no count period ends in the window", () => {
  const report = { ...taproomVariance.report!, reason: "no_completed_periods", rows: [], periods: [] };
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { weeks: 4, timeZone: "America/New_York", report } }));
  expect(html.match(/No completed count periods in this window/g)).toHaveLength(1);
  expect(html).not.toContain("No saved count endings");
  expect(html).not.toContain("Count periods");
});

it("#1118 a window holding only a first count lists it under Count periods, not as a completed period", () => {
  const report = { ...taproomVariance.report!, reason: "no_completed_periods", rows: [], periods: [{ ...taproomVariance.report!.periods[0], prior_count_id: null, starts_at: null, expected_bbl: null, reason: "missing_baseline" }] };
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { weeks: 4, timeZone: "America/New_York", report } }));
  expect(html).toContain("No completed count periods in this window");
  expect(html).toContain(">Count periods</h2>");
  expect(html).not.toContain("Completed periods");
  expect(html).toContain("First count, so there is nothing to compare against · coverage");
});

it("#1118 shows the week-by-week tip only beside a trend, and reading help as neutral info", () => {
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { ...taproomVariance, trend: undefined } }));
  expect(html).not.toContain("Not available yet.");
  expect(html).not.toContain("A brand short every week");
  expect(html).toContain("A dash means a value is unavailable");
  expect(html).not.toContain("bg-warning");
  expect(renderToStaticMarkup(createElement(TaproomVarianceView, { model: taproomVariance }))).toContain("A brand short every week");
});

it("#1118 titles the page once, with the name the nav uses", () => {
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: taproomVariance }));
  expect(html.match(/>Variance by brand</g)).toHaveLength(1);
  expect(html).toMatch(/<h1[^>]*>Variance by brand<\/h1>/);
});

it("#1118 draws the week tabs as the full-width TabBar the inventory draws", () => {
  const weekHrefs = { "4 weeks": "/taproom/variance?weeks=4", "12 weeks": "/taproom/variance?weeks=12" };
  const live = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { ...taproomVariance, weekHrefs } }));
  const tabs = (html: string) => html.match(/<div role="tablist"[^>]*>/)?.[0];
  expect(live).toContain('href="/taproom/variance?weeks=12"');
  expect(tabs(live)).toBe(tabs(renderToStaticMarkup(createElement(TaproomVarianceView, { model: taproomVariance }))));
  expect(tabs(live)).not.toContain("md:w-fit");
});
