// tests/keg-report-view.test.ts — get_keg_report → Keg report view-model (issue #278).
import { describe, expect, it } from "vitest";
import { toKegReportViewProps } from "@/lib/mgr/keg-report-view";

const report = {
  fleet: { out: 142, total: 203, utilization: 142 / 203 },
  bySize: [{ pool_id: "p", pool_name: "Owned", keg_size: "sixth_bbl", out: 18, total: 36 }],
  aging: [{ bucket: "0-30", kegs: 96, deposit_cents: 288000 }, { bucket: "90+", kegs: 9, deposit_cents: 27000 }],
  customers: [{ customer_id: "c", name: "Ridgeline Tap Room", over_90: 9, oldest_at: "2026-05-12T00:00:00+00:00" }],
};

describe("toKegReportViewProps", () => {
  it("prints utilization, buckets, customers and sizes the way the inventory draws them", () => {
    const m = toKegReportViewProps(report);
    expect(m.headline).toEqual(["70%", "142 of 203 kegs out"]);
    expect(m.aging).toEqual([["0–30 days", "96", "$2,880"], ["Over 90 days", "9", "$270"]]);
    expect(m.customers).toEqual([{ key: "c", href: "/kegs/customers/c", title: "Ridgeline Tap Room", detail: "9 over 90 days · oldest 5/12" }]);
    expect(m.sizes).toEqual([{ key: "p-sixth_bbl", title: "Owned ⅙ bbl", detail: "18 of 36 out", trailing: "50% utilized" }]);
    expect(m.empty).toBeUndefined();
  });
  it("an empty fleet is the empty state", () => {
    const m = toKegReportViewProps({ fleet: { out: 0, total: 0, utilization: null }, bySize: [], aging: [], customers: [] });
    expect(m.headline).toEqual(["—", "0 of 0 kegs out"]);
    expect(m.empty?.title).toBe("No owned keg pools");
  });
  it("a customer with nothing over 90 days still lists with the oldest date", () => {
    const m = toKegReportViewProps({ ...report, customers: [{ customer_id: "c", name: "Al’s", over_90: 0, oldest_at: "2026-09-01T00:00:00+00:00" }] });
    expect(m.customers[0].detail).toBe("none over 90 days · oldest 9/1");
  });
});
