// tests/keg-aging.test.ts — FIFO aging of unreturned kegs (issue #278, Keg report).
import { describe, expect, it } from "vitest";
import { kegAging } from "@/lib/keg-aging";

const now = new Date("2026-09-13T00:00:00Z");
const ev = (reason: string, qty: number, at: string, customer_id: string | null = "c1") => ({ customer_id, pool_id: "p1", keg_size: "half_bbl", qty, reason, at });

describe("kegAging", () => {
  it("returns retire the oldest shipments first", () => {
    const out = kegAging([ev("shipped", 3, "2026-05-01"), ev("shipped", 2, "2026-08-20"), ev("returned", 3, "2026-09-01")], now);
    expect(out).toEqual([{ customer_id: "c1", pool_id: "p1", keg_size: "half_bbl", qty: 2, shipped_at: "2026-08-20", days: 24 }]);
  });
  it("splits a partially returned shipment", () => {
    const out = kegAging([ev("shipped", 5, "2026-05-01"), ev("returned", 2, "2026-06-01")], now);
    expect(out).toEqual([{ customer_id: "c1", pool_id: "p1", keg_size: "half_bbl", qty: 3, shipped_at: "2026-05-01", days: 135 }]);
  });
  it("lost kegs also leave the queue and customers do not mix", () => {
    const out = kegAging([ev("shipped", 1, "2026-05-01"), ev("shipped", 1, "2026-05-01", "c2"), ev("lost", 1, "2026-06-01")], now);
    expect(out).toEqual([{ customer_id: "c2", pool_id: "p1", keg_size: "half_bbl", qty: 1, shipped_at: "2026-05-01", days: 135 }]);
  });
  it("ignores events with no customer", () => {
    expect(kegAging([ev("acquired", 10, "2026-01-01", null)], now)).toEqual([]);
  });
  it("orders by instant, not by text: PostgREST drops the fraction on whole seconds (#455)", () => {
    // localeCompare puts "…10:00:00+00:00" after "…10:00:00.5+00:00", so the
    // return used to run before both shipments, retire nothing, and leave 3 open.
    const out = kegAging([
      ev("shipped", 2, "2026-09-01T10:00:00+00:00"),
      ev("shipped", 1, "2026-09-01T10:00:00+00:00"),
      ev("returned", 1, "2026-09-01T10:00:00.5+00:00"),
    ], now);
    expect(out.reduce((n, a) => n + a.qty, 0)).toBe(2);
  });
});

