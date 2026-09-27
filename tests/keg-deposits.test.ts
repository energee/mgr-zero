// tests/keg-deposits.test.ts — #577: the keg ledger and the deposit lines
// stay separate, so each customer × pool × size row carries both counts and
// is flagged when a deposit was invoiced and the counts disagree.
import { describe, expect, it } from "vitest";
import { kegDepositRows } from "@/lib/keg-deposits";

const keg = (customer_id: string, qty: number, keg_size = "half_bbl") => ({ customer_id, pool_id: "p", keg_size, qty });
const dep = (customer_id: string, kegs_on_deposit: number, keg_size = "half_bbl") =>
  ({ customer_id, keg_pool_id: "p", keg_size, kegs_on_deposit, deposit_cents: kegs_on_deposit * 3000 });

describe("kegDepositRows", () => {
  it("agrees when kegs out equal kegs on deposit", () => {
    expect(kegDepositRows([keg("c", 3)], [dep("c", 3)])).toEqual([
      { customer_id: "c", pool_id: "p", keg_size: "half_bbl", kegs_out: 3, kegs_on_deposit: 3, deposit_cents: 9000, mismatch: false },
    ]);
  });
  it("flags a deposit refunded while the keg is still out, and the reverse", () => {
    expect(kegDepositRows([keg("a", 3), keg("b", 1)], [dep("a", 2), dep("b", 2)]).map((r) => [r.customer_id, r.mismatch])).toEqual([["a", true], ["b", true]]);
  });
  it("keeps a deposit held with no keg out, flagged", () => {
    expect(kegDepositRows([], [dep("c", 2)])).toEqual([
      { customer_id: "c", pool_id: "p", keg_size: "half_bbl", kegs_out: 0, kegs_on_deposit: 2, deposit_cents: 6000, mismatch: true },
    ]);
  });
  it("never flags a customer who was never invoiced a deposit", () => {
    expect(kegDepositRows([keg("c", 4)], [])).toEqual([
      { customer_id: "c", pool_id: "p", keg_size: "half_bbl", kegs_out: 4, kegs_on_deposit: 0, deposit_cents: 0, mismatch: false },
    ]);
  });
  it("drops a pool and size with nothing out and nothing on deposit", () => {
    expect(kegDepositRows([keg("c", 0)], [dep("c", 0)])).toEqual([]);
  });
  it("matches per size, not per customer total", () => {
    const rows = kegDepositRows([keg("c", 2, "half_bbl"), keg("c", 1, "sixth_bbl")], [dep("c", 1, "half_bbl"), dep("c", 2, "sixth_bbl")]);
    expect(rows.map((r) => [r.keg_size, r.mismatch])).toEqual([["half_bbl", true], ["sixth_bbl", true]]);
  });
});
