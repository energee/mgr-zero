import { expect, it } from "vitest";
import { destinationStateCsv } from "../lib/mgr/destination-state-export";

it("exports exact volume/cents and safely quotes source text", () => {
  const csv = destinationStateCsv("2025-09-01", "2025-09-30", [{ state: "NY", kind: '=formula,"value"', eventDate: "2025-09-03", sourceId: "source-1", originalSourceId: "original-1", volumeBbl: -0.06451613, salesCents: -3600, sourceStatus: "live" }]);
  expect(csv).toContain('"2025-09-01","2025-09-30","NY","\'=formula,""value"""');
  expect(csv).toContain('"-0.06451613","-3600"');
  expect(csv).toContain('"source-1","original-1"');
});
