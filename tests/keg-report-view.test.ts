// tests/keg-report-view.test.ts — get_keg_report → Keg report view-model (issue #278).
import { describe, expect, it } from "vitest";
import { toKegReportViewProps } from "@/lib/mgr/keg-report-view";

const report = {
  fleet: { out: 142, total: 203, utilization: 142 / 203 },
  bySize: [{ pool_id: "p", pool_name: "Owned", keg_size: "sixth_bbl", out: 18, total: 36 }],
  aging: [{ bucket: "0-30", kegs: 96, deposit_cents: 288000 }, { bucket: "90+", kegs: 9, deposit_cents: 27000 }],
  customers: [{ customer_id: "c", name: "Ridgeline Tap Room", over_90: 9, oldest_at: "2026-05-12T16:00:00+00:00" }],
  mismatches: [],
};

describe("toKegReportViewProps", () => {
  it("prints utilization, buckets, customers and sizes the way the inventory draws them", () => {
    const m = toKegReportViewProps(report, "America/New_York");
    expect(m.headline).toEqual(["70%", "142 of 203 kegs out"]);
    expect(m.aging).toEqual([["0–30 days", "96", "$2,880.00"], ["Over 90 days", "9", "$270.00"]]);
    expect(m.customers).toEqual([{ key: "c", href: undefined, title: "Ridgeline Tap Room", detail: "9 over 90 days · oldest shipped May 12, 2026", overdue: true }]);
    expect(toKegReportViewProps(report, "America/New_York", "/kegs").customers[0].href).toBe("/kegs/customers/c");
    expect(m.sizes).toEqual([{ key: "p-sixth_bbl", title: "Owned ⅙ bbl", detail: "18 of 36 out", trailing: "50% utilized" }]);
    expect(m.empty).toBeUndefined();
  });
  it("lists each deposit mismatch as a flagged row opening that customer's balance (#577)", () => {
    const mismatches = [{ customer_id: "c", name: "Al’s Bar", pool_id: "p", pool_name: "Owned", keg_size: "half_bbl", kegs_out: 3, kegs_on_deposit: 2 }];
    expect(toKegReportViewProps({ ...report, mismatches }, "America/New_York").mismatches).toEqual([
      { key: "c-p-half_bbl", href: undefined, title: "Al’s Bar", detail: "Owned ½ bbl · 3 out · 2 on deposit" },
    ]);
    expect(toKegReportViewProps({ ...report, mismatches }, "America/New_York", "/kegs").mismatches[0].href).toBe("/kegs/customers/c");
  });
  it("an empty fleet is the empty state", () => {
    const m = toKegReportViewProps({ fleet: { out: 0, total: 0, utilization: null }, bySize: [], aging: [], customers: [], mismatches: [] }, "America/New_York");
    expect(m.headline).toEqual(["—", "0 of 0 kegs out"]);
    expect(m.empty?.title).toBe("No owned keg pools");
  });
  it("a customer with nothing over 90 days still lists with the oldest date", () => {
    const m = toKegReportViewProps({ ...report, customers: [{ customer_id: "c", name: "Al’s", over_90: 0, oldest_at: "2026-09-01T00:00:00+00:00" }] }, "America/New_York");
    // Midnight UTC is 8 PM the evening before in New York: the brewery's day, not the UTC prefix (#442).
    expect(m.customers[0]).toMatchObject({ detail: "none over 90 days · oldest shipped Aug 31, 2026", overdue: false });
  });
});
