// tests/keg-deposits.test.ts — #577: the keg ledger and the deposit lines
// stay separate, so each customer × pool × size row carries both counts. A row
// is flagged only once a deposit on it was refunded and the deposits held
// disagree with kegs out plus kegs lost at the customer.
import { describe, expect, it } from "vitest";
import { kegDepositRows } from "@/lib/keg-deposits";

const keg = (customer_id: string, qty: number, keg_size = "half_bbl") => ({ customer_id, pool_id: "p", keg_size, qty });
const dep = (customer_id: string, kegs_on_deposit: number, keg_size = "half_bbl") =>
  ({ customer_id, keg_pool_id: "p", keg_size, kegs_on_deposit, deposit_cents: kegs_on_deposit * 3000 });
const refunded = (customer_id: string, keg_size = "half_bbl") => [keg(customer_id, 1, keg_size)];

describe("kegDepositRows", () => {
  it("agrees when kegs out equal kegs on deposit", () => {
    expect(kegDepositRows([keg("c", 3)], [dep("c", 3)], { lost: [], refunded: refunded("c") })).toEqual([
      { customer_id: "c", pool_id: "p", keg_size: "half_bbl", kegs_out: 3, kegs_on_deposit: 3, deposit_cents: 9000, mismatch: false },
    ]);
  });
  it("flags a refunded deposit whose kegs out disagree, either way", () => {
    const rows = kegDepositRows([keg("a", 3), keg("b", 1)], [dep("a", 2), dep("b", 2)], { lost: [], refunded: [...refunded("a"), ...refunded("b")] });
    expect(rows.map((r) => [r.customer_id, r.mismatch])).toEqual([["a", true], ["b", true]]);
  });
  it("does not flag a shipment whose Shipped keg event is not recorded yet, until a deposit is refunded", () => {
    expect(kegDepositRows([], [dep("c", 2)], { lost: [], refunded: [] })).toEqual([
      { customer_id: "c", pool_id: "p", keg_size: "half_bbl", kegs_out: 0, kegs_on_deposit: 2, deposit_cents: 6000, mismatch: false },
    ]);
    expect(kegDepositRows([], [dep("c", 1)], { lost: [], refunded: refunded("c") })[0].mismatch).toBe(true);
  });
  it("counts a keg lost at the customer as still on deposit", () => {
    // 3 shipped, 1 lost, 1 returned with its deposit refunded: 1 out + 1 lost = 2 on deposit.
    expect(kegDepositRows([keg("c", 1)], [dep("c", 2)], { lost: [keg("c", 1)], refunded: refunded("c") })[0].mismatch).toBe(false);
  });
  it("never flags a customer who was never invoiced a deposit", () => {
    expect(kegDepositRows([keg("c", 4)], [], { lost: [], refunded: [] })[0].mismatch).toBe(false);
  });
  it("drops a pool and size with nothing out and nothing on deposit", () => {
    expect(kegDepositRows([keg("c", 0)], [dep("c", 0)], { lost: [], refunded: refunded("c") })).toEqual([]);
  });
  it("matches per size, not per customer total", () => {
    const rows = kegDepositRows([keg("c", 2, "half_bbl"), keg("c", 1, "sixth_bbl")], [dep("c", 1, "half_bbl"), dep("c", 2, "sixth_bbl")],
      { lost: [], refunded: [...refunded("c", "half_bbl"), ...refunded("c", "sixth_bbl")] });
    expect(rows.map((r) => [r.keg_size, r.mismatch])).toEqual([["half_bbl", true], ["sixth_bbl", true]]);
  });
});
