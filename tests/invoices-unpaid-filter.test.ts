// tests/invoices-unpaid-filter.test.ts — list_invoices({ status: "unpaid" })
// keeps only invoices that still owe money, in the query, across pages (#1516).
import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCustomer } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Page = { rows: { id: string }[]; nextCursor: string | null };
let staff: Ctx;
const id = () => crypto.randomUUID();
const owed = { ledger: id(), qboOwed: id(), qboOwedMarkedPaid: id() };
const settled = { paid: id(), qboSettled: id(), qboCredit: id(), writtenOff: id(), voided: id(), creditMemo: id() };

beforeAll(async () => {
  const brewery = await makeBrewery();
  staff = await makeStaffCtx(brewery.id, "sales");
  const { customerId } = await seedCustomer(brewery.id);
  // Seconds apart, newest first in this order, so paging has a stable shape.
  const rows: Record<string, unknown>[] = [
    { id: owed.ledger },
    { id: owed.qboOwed, qbo_balance_cents: 5000 },
    { id: owed.qboOwedMarkedPaid, paid_at: "2026-10-01T12:00:00Z", qbo_balance_cents: 2500 },
    { id: settled.paid, paid_at: "2026-10-01T12:00:00Z" },
    { id: settled.qboSettled, qbo_balance_cents: 0 },
    { id: settled.qboCredit, qbo_balance_cents: -500 },
    { id: settled.writtenOff, written_off_at: "2026-10-01T12:00:00Z", written_off_by: staff.userId, written_off_reason: "Uncollectable" },
    { id: settled.voided, qbo_remote_state: "voided", qbo_balance_cents: 5000 },
    { id: settled.creditMemo, kind: "credit_memo" },
  ];
  const { error } = await admin.from("invoices").insert(rows.map((row, i) => ({
    brewery_id: brewery.id, customer_id: customerId, kind: "invoice",
    created_at: new Date(Date.UTC(2026, 9, 20, 12, 0, 59 - i)).toISOString(), ...row,
  })), { defaultToNull: false }); // a column one row leaves out keeps its default
  if (error) throw error;
});

it("lists only invoices that still owe money, page by page", async () => {
  const first = await runCommand("list_invoices", { status: "unpaid", limit: 2 }, staff) as Page;
  expect(first.rows.map(row => row.id)).toEqual([owed.ledger, owed.qboOwed]);
  const next = await runCommand("list_invoices", { status: "unpaid", limit: 2, cursor: first.nextCursor }, staff) as Page;
  expect(next.rows.map(row => row.id)).toEqual([owed.qboOwedMarkedPaid]);
  expect(next.nextCursor).toBeNull();
});

it("lists every invoice without the filter", async () => {
  const all = await runCommand("list_invoices", {}, staff) as Page;
  expect(all.rows).toHaveLength(Object.keys(owed).length + Object.keys(settled).length);
});
