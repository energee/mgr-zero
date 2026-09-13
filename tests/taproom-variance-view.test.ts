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
  expect(varianceReason("missing_baseline")).toBe("First count · no prior observation");
  expect(varianceReason("no_pos_coverage")).toBe("No usable POS coverage");
});

it("preserves nulls, coverage, exclusions and absent trends in the shared report", () => {
  const report = taproomVariance.report!;
  const html = renderToStaticMarkup(createElement(TaproomVarianceView, { model: { weeks: 4, report: { ...report, rows: [{ ...report.rows[0], expected_bbl: null, variance_bbl: null, excluded_bbl: 2, unattributed_bbl: 1 }], periods: [{ ...report.periods[0], expected_bbl: null, coverage_complete: false, unmapped_lines: 3 }] } } }));
  expect(html).toContain("2 bbl excluded outside inventory");
  expect(html).toContain("1 bbl unattributed");
  expect(html).toContain("coverage incomplete");
  expect(html).toContain("3 unmapped POS lines");
  expect(html).toContain("variance —");
  expect(html).toContain("Recurring brand trend");
  expect(html).not.toContain("short 4 weeks running");
  expect(html).not.toContain('href="/taproom');
});
