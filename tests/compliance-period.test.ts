// tests/compliance-period.test.ts — a TTB filing covers exactly one calendar
// month, quarter, or year (#486), and the period keys the compliance pages use
// for each. Pure: parses the registered input schema, no database.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/compliance";
import { firstPeriodFrom, periodKey, periodLabel, periodOver, periodRange, periodStatus, recentPeriods, startsBeforeBooks } from "@/lib/compliance-period";

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

  it("classifies each calendar boundary without arbitrary historical limits (#1310)", () => {
    expect(periodStatus(periodRange("2026-09")!, "2026-09-01")).toBe("Current");
    expect(periodStatus(periodRange("2026-09")!, "2026-09-30")).toBe("Current");
    expect(periodStatus(periodRange("2026-Q3")!, "2026-10-01")).toBe("Past");
    expect(periodStatus(periodRange("2025")!, "2026-10-24")).toBe("Past");
    expect(periodStatus(periodRange("2030-01")!, "2026-10-24")).toBe("Upcoming");
    expect(periodStatus(periodRange("1999-01")!, "2026-10-24")).toBe("Past");
    expect(startsBeforeBooks("1999-01", null)).toBe(false);
    expect(startsBeforeBooks("1999-01", "1998-01-01")).toBe(false);
    expect(startsBeforeBooks("1999-01", "2026-01-01")).toBe(true);
  });

  it("lists the recent periods of each cadence, newest first", () => {
    expect(recentPeriods("2026-01-15", "month")).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(recentPeriods("2026-01-15", "quarter")).toEqual(["2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2"]);
    expect(recentPeriods("2026-01-15", "year")).toEqual(["2026", "2025"]);
  });

  it("leaves out periods that start before the books opened, which no report can cover", () => {
    expect(recentPeriods("2026-01-15", "month", "2025-12-01")).toEqual(["2026-01", "2025-12"]);
    expect(recentPeriods("2026-01-15", "month", "2025-12-15")).toEqual(["2026-01"]);
    expect(recentPeriods("2026-01-15", "quarter", "2025-07-01")).toEqual(["2026-Q1", "2025-Q4", "2025-Q3"]);
    expect(recentPeriods("2026-01-15", "year", "2026-01-01")).toEqual(["2026"]);
    expect(recentPeriods("2026-01-15", "month", null)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });

  it("a period that starts before the books opened has no report (#987)", () => {
    expect(startsBeforeBooks("2026-10", "2026-10-15")).toBe(true);
    expect(startsBeforeBooks("2026-11", "2026-10-15")).toBe(false);
    expect(startsBeforeBooks("2026-10", "2026-10-01")).toBe(false);
    expect(startsBeforeBooks("2026-10", null)).toBe(false);
  });

  it("refuses to classify a key that is not a period instead of calling it before the books (#987 review)", () => {
    expect(() => startsBeforeBooks("2026-13", "2026-10-15")).toThrow();
  });

  it("names the first period of each cadence that starts on or after the books opened (#987)", () => {
    expect(firstPeriodFrom("2026-10-15", "month")).toBe("2026-11");
    expect(firstPeriodFrom("2026-10-01", "month")).toBe("2026-10");
    expect(firstPeriodFrom("2026-12-15", "month")).toBe("2027-01");
    expect(firstPeriodFrom("2026-10-15", "quarter")).toBe("2027-Q1");
    expect(firstPeriodFrom("2026-04-01", "quarter")).toBe("2026-Q2");
    expect(firstPeriodFrom("2026-10-15", "year")).toBe("2027");
    expect(firstPeriodFrom("2026-01-01", "year")).toBe("2026");
  });
});
