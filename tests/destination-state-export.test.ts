import { expect, it } from "vitest";
import { destinationStateCsv, destinationStateTotals } from "../lib/mgr/destination-state-export";

it("exports exact volume/cents and safely quotes source text", () => {
  const csv = destinationStateCsv("2025-09-01", "2025-09-30", [{ state: "NY", kind: '=formula,"value"', eventDate: "2025-09-03", sourceId: "source-1", originalSourceId: "original-1", volumeBbl: -0.06451613, salesCents: -3600, sourceStatus: "live" }]);
  expect(csv).toContain('"2025-09-01","2025-09-30","NY","\'=formula,""value"""');
  expect(csv).toContain('"-0.06451613","-3600"');
  expect(csv).toContain('"source-1","original-1"');
});

it("sums per-state totals from the facts, so totals and export cannot disagree", () => {
  const fact = { eventDate: "2025-09-03", sourceId: "s", originalSourceId: null, sourceStatus: "posted" };
  const totals = destinationStateTotals([
    { ...fact, state: "NY", kind: "sale_removal", volumeBbl: 0.5, salesCents: 0 },
    { ...fact, state: "NY", kind: "cellar_sample", volumeBbl: 0.25, salesCents: 0 },
    { ...fact, state: "NY", kind: "return_in", volumeBbl: -0.125, salesCents: 0 },
    { ...fact, state: "NY", kind: "invoice", volumeBbl: 0, salesCents: 3600 },
    { ...fact, state: "NY", kind: "credit_memo", volumeBbl: 0, salesCents: -1200 },
    { ...fact, state: "Unassigned", kind: "adjustment", volumeBbl: -0.0625, salesCents: 0 },
  ]);
  expect(totals).toEqual([
    { state: "NY", volumeBbl: 0.625, outwardBbl: 0.75, returnedBbl: 0.125, adjustmentBbl: 0, invoicedCents: 3600, creditedCents: 1200, salesCents: 2400 },
    { state: "Unassigned", volumeBbl: -0.0625, outwardBbl: 0, returnedBbl: 0, adjustmentBbl: -0.0625, invoicedCents: 0, creditedCents: 0, salesCents: 0 },
  ]);
});
