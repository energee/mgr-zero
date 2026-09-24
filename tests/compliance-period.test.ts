// tests/compliance-period.test.ts — a TTB filing covers exactly one calendar
// month, quarter, or year (#486), and the period keys the compliance pages use
// for each. Pure: parses the registered input schema, no database.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/compliance";
import { periodKey, periodLabel, periodOver, periodRange, recentPeriods } from "@/app/(app)/compliance/period";

const file = (periodStart: string, periodEnd: string, jurisdiction = "TTB") =>
  getCommandDefinition("file_compliance_report")!.input.safeParse({ jurisdiction, periodStart, periodEnd });

describe("file_compliance_report period", () => {
  it("accepts a whole calendar month, including February in a leap year", () => {
    expect(file("2025-08-01", "2025-08-31").success).toBe(true);
    expect(file("2024-02-01", "2024-02-29").success).toBe(true);
  });

  it("accepts a whole calendar quarter and a whole calendar year", () => {
    for (const [start, end] of [["2025-01-01", "2025-03-31"], ["2025-04-01", "2025-06-30"], ["2025-07-01", "2025-09-30"], ["2025-10-01", "2025-12-31"], ["2025-01-01", "2025-12-31"]]) {
      expect(file(start, end).success, `${start}..${end}`).toBe(true);
    }
  });

  it("refuses a TTB range that is not one whole month, quarter, or year", () => {
    for (const [start, end] of [
      ["2025-08-10", "2025-08-20"], ["2025-08-01", "2025-08-30"], ["2025-08-02", "2025-08-31"], ["2025-08-01", "2025-09-30"],
      ["2025-02-01", "2025-04-30"], ["2025-07-01", "2025-09-29"], ["2025-07-02", "2025-09-30"], ["2025-01-01", "2025-12-30"], ["2025-01-01", "2026-03-31"],
    ]) {
      const r = file(start, end);
      expect(r.success, `${start}..${end}`).toBe(false);
      expect(r.error?.issues[0].message).toMatch(/one calendar month, quarter, or year/);
    }
  });

  it("leaves other jurisdictions' periods to the caller", () => {
    expect(file("2025-02-01", "2025-04-30", "US-PA").success).toBe(true);
  });
});

describe("compliance period keys", () => {
  it("maps a month, quarter, or year key to its dates and back", () => {
    expect(periodRange("2025-08")).toEqual({ periodStart: "2025-08-01", periodEnd: "2025-08-31" });
    expect(periodRange("2025-Q1")).toEqual({ periodStart: "2025-01-01", periodEnd: "2025-03-31" });
    expect(periodRange("2025-Q4")).toEqual({ periodStart: "2025-10-01", periodEnd: "2025-12-31" });
    expect(periodRange("2025")).toEqual({ periodStart: "2025-01-01", periodEnd: "2025-12-31" });
    for (const bad of ["2025-13", "2025-Q5", "2025-Q0", "25", "x"]) expect(periodRange(bad), bad).toBeNull();
    for (const key of ["2025-08", "2025-Q3", "2025"]) {
      const r = periodRange(key)!;
      expect(periodKey(r.periodStart, r.periodEnd)).toBe(key);
    }
    expect(periodKey("2025-02-01", "2025-04-30")).toBeNull();
  });

  it("labels each period", () => {
    expect(periodLabel("2025-08")).toBe("August 2025");
    expect(periodLabel("2025-Q3")).toBe("Q3 2025");
    expect(periodLabel("2025")).toBe("2025");
  });

  it("a quarter or year is filable only once its last day has passed (#484)", () => {
    expect(periodOver("2025-Q3", "2025-09-30")).toBe(false);
    expect(periodOver("2025-Q3", "2025-10-01")).toBe(true);
    expect(periodOver("2025", "2025-12-31")).toBe(false);
    expect(periodOver("2025", "2026-01-01")).toBe(true);
  });

  it("lists the recent periods of each cadence, newest first", () => {
    expect(recentPeriods("2026-01-15", "month")).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(recentPeriods("2026-01-15", "quarter")).toEqual(["2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2"]);
    expect(recentPeriods("2026-01-15", "year")).toEqual(["2026", "2025"]);
  });
});
