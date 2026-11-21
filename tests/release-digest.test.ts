// tests/release-digest.test.ts — the weekly release digest's wording
// (docs/plans/release-pool-and-ceilings.md, stage 3): one email per portal user
// with new releases, limits about to lift and beer open to everyone, nothing
// for a user with none of those, and a job route that only its secret opens.
import { describe, expect, it, vi } from "vitest";
import { buildReleaseDigests, type DigestRow } from "../lib/mgr/release-digest";

const row = (over: Partial<DigestRow> = {}): DigestRow => ({
  brewery_id: "b1", brewery_name: "Demo Brewing", customer_id: "c1", user_id: "u1", digest_week: "2026-11-23", today: "2026-11-23", lift_days: 14,
  brand: "Animal #34", package: "Sixtel", release_id: "r1", sku_id: "s1", ships_from: "2026-12-16", orders_close_on: "2026-12-09",
  new_this_week: true, badge: "in", bbl_per_unit: 0.1, limit_left_bbl: null, limit_lifts_on: null, suggested_qty: null, ...over,
});

describe("release digest", () => {
  it("leads with new beers: their packages, the buyer's usual order and their limit", () => {
    const [digest] = buildReleaseDigests([
      row({ suggested_qty: 4, limit_left_bbl: 2.3, limit_lifts_on: "2026-12-02" }),
      row({ package: "Case", release_id: "r2", sku_id: "s2", suggested_qty: 10, limit_left_bbl: 2.3, limit_lifts_on: "2026-12-02" }),
      row({ package: "Half", release_id: "r3", sku_id: "s3", badge: "out", limit_left_bbl: 2.3, limit_lifts_on: "2026-12-02" }),
    ], "https://mgr.test");
    expect(digest).toMatchObject({ breweryId: "b1", customerId: "c1", userId: "u1", week: "2026-11-23", subject: "Demo Brewing: 1 new beer to pre-order" });
    expect(digest.text).toBe([
      "Pre-orders from Demo Brewing", "",
      "NEW THIS WEEK",
      "Animal #34 · ships Dec 16, 2026 · order by Dec 9, 2026",
      // The sold-out half is left off.
      "  Sixtel, Case",
      "  Your usual: 4 Sixtel, 10 Case",
      "  You can order 2.3 bbl more of this batch until Dec 2.",
      "",
      "Review and submit: https://mgr.test/portal/pre-order?suggested=1",
    ].join("\n"));
  });

  it("holds the usual quantities to the buyer's limit on the batch", () => {
    const [digest] = buildReleaseDigests([
      row({ bbl_per_unit: 0.5, suggested_qty: 6, limit_left_bbl: 2.2, limit_lifts_on: "2026-12-02" }),
      row({ package: "Case", release_id: "r2", sku_id: "s2", suggested_qty: 10, limit_left_bbl: 2.2, limit_lifts_on: "2026-12-02" }),
    ], "https://mgr.test");
    // 2.2 bbl: four half-barrel units, then two 0.1 bbl cases from what is left.
    expect(digest.text).toContain("Your usual: 4 Sixtel, 2 Case");
  });

  it("names limits that lift within a week, and beer past its lift date as open to everyone", () => {
    const [digest] = buildReleaseDigests([
      // The limit lifts in five days.
      row({ brand: "Reptile #7", ships_from: "2026-12-12", orders_close_on: null, new_this_week: false, limit_left_bbl: 0, limit_lifts_on: "2026-11-28" }),
      // Ships in nine days: past the 14-day lift, so no limit applies.
      row({ brand: "Priam", ships_from: "2026-12-02", orders_close_on: "2026-11-25", new_this_week: false }),
      // An older release still under its limit, not lifting this week: not mentioned.
      row({ brand: "Akko", ships_from: "2026-12-30", new_this_week: false, limit_left_bbl: 3, limit_lifts_on: "2026-12-16" }),
    ], "https://mgr.test");
    expect(digest.subject).toBe("Demo Brewing: pre-orders open this week");
    expect(digest.text).toContain("LIMITS LIFTING SOON\nReptile #7 · ships Dec 12, 2026: the limit lifts Nov 28. You have reached your limit on this batch until Nov 28.");
    expect(digest.text).toContain("OPEN TO EVERYONE\nPriam · ships Dec 2, 2026 · order by Nov 25, 2026");
    expect(digest.text).not.toContain("NEW THIS WEEK");
    expect(digest.text).not.toContain("Akko");
  });

  it("writes one email per portal user and none for a user with nothing to read", () => {
    const digests = buildReleaseDigests([
      row(), row({ user_id: "u2" }),
      row({ customer_id: "c2", user_id: "u3", new_this_week: false, ships_from: "2026-12-30", limit_left_bbl: 3, limit_lifts_on: "2026-12-16" }),
      row({ customer_id: "c3", user_id: "u4", badge: "out" }),
    ], "https://mgr.test");
    expect(digests.map((d) => [d.customerId, d.userId])).toEqual([["c1", "u1"], ["c1", "u2"]]);
  });
});

describe("release digest job route", () => {
  it("answers 401 without the order email job's secret, before any work", async () => {
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "email-only");
    const { POST } = await import("../app/api/email/jobs/digest/route");
    const response = await POST(new Request("https://mgr.test/api/email/jobs/digest", { method: "POST", headers: { authorization: "Bearer wrong" } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
    vi.unstubAllEnvs();
  });
});
