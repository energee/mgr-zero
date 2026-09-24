// tests/compliance-period.test.ts — a TTB filing covers exactly one calendar
// month (#486). Pure: parses the registered input schema, no database.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/compliance";

const file = (periodStart: string, periodEnd: string, jurisdiction = "TTB") =>
  getCommandDefinition("file_compliance_report")!.input.safeParse({ jurisdiction, periodStart, periodEnd });

describe("file_compliance_report period", () => {
  it("accepts a whole calendar month, including February in a leap year", () => {
    expect(file("2025-08-01", "2025-08-31").success).toBe(true);
    expect(file("2024-02-01", "2024-02-29").success).toBe(true);
  });

  it("refuses a TTB range that is not one whole month", () => {
    for (const [start, end] of [["2025-08-10", "2025-08-20"], ["2025-08-01", "2025-08-30"], ["2025-08-02", "2025-08-31"], ["2025-08-01", "2025-09-30"]]) {
      const r = file(start, end);
      expect(r.success, `${start}..${end}`).toBe(false);
      expect(r.error?.issues[0].message).toMatch(/one calendar month/);
    }
  });

  it("leaves other jurisdictions' periods to the caller", () => {
    expect(file("2025-07-01", "2025-09-30", "US-PA").success).toBe(true);
  });
});
