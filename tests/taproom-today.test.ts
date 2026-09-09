import { expect, it } from "vitest";
import { taproomTodayRows } from "@/lib/mgr/taproom-today";

const location = { id: "11111111-1111-4111-8111-111111111111", name: "Main taproom" };
const report = { as_of: "2026-09-08T15:00:00Z", reason: null, rows: [{ variance_bbl: 0 }], periods: [{ coverage_complete: true, reason: null }] };

it("shows permitted Taproom exits from observed facts without inventing due policy", () => {
  const rows = taproomTodayRows(location, [], [{ counted_on: "2026-09-07", created_at: "2026-09-07T14:00:00Z" }], report);
  expect(rows.map((row) => [row.label, row.verb, row.href])).toEqual([
    ["Tap board", "Open", `/taproom/board?location=${location.id}`],
    ["Weekly count", "Count", `/taproom?location=${location.id}`],
    ["Variance · 4 weeks", "Review", `/taproom/variance?location=${location.id}&weeks=4`],
  ]);
  expect(rows[0].detail).toContain("no open kegs observed");
  expect(rows[1].detail).toContain("last saved 2026-09-07");
  expect(rows[2].detail).toContain("0 bbl expected minus actual");
  expect(JSON.stringify(rows)).not.toMatch(/overdue|shift/i);
});

it("keeps unavailable variance distinct from observed zero", () => {
  const rows = taproomTodayRows(location, [], [], { ...report, reason: "no_pos_coverage", rows: [] });
  expect(rows[2].detail).toContain("no pos coverage");
  expect(rows[2].detail).not.toContain("0 bbl");
});

it("labels mapped variance from incomplete POS coverage as partial", () => {
  const rows = taproomTodayRows(location, [], [], {
    ...report,
    rows: [{ variance_bbl: .25 }],
    periods: [{ coverage_complete: false, reason: null }],
  });
  expect(rows[2].detail).toContain("0.25 bbl expected minus actual · partial POS coverage");
});
