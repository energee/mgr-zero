import { beforeAll, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import type { NumberedHistoryPage } from "@/lib/commands/history";
import "@/lib/commands/all";

type Row = { id: string; created_at: string; customer_id: string };
let staff: Ctx, buyer: Ctx, customerId: string;
const ids = Array.from({ length: 55 }, () => crypto.randomUUID()).sort();
beforeAll(async () => {
  const brewery = await makeBrewery();
  staff = await makeStaffCtx(brewery.id);
  const customer = await seedCustomer(brewery.id);
  customerId = customer.customerId;
  const other = await seedCustomer(brewery.id, { name: "Other buyer" });
  const location = await seedLocation(brewery.id);
  const user = await makeCustomerUser(customerId);
  buyer = { db: await asUser(user.email), userId: user.id, breweryId: brewery.id, roles: ["customer"], customerId };
  const rows = [...ids.map(id => ({ id, customer_id: customerId, ship_to_id: customer.shipToId })),
    { id: crypto.randomUUID(), customer_id: other.customerId, ship_to_id: other.shipToId }];
  const common = { brewery_id: brewery.id, created_at: "2026-09-20T12:00:00.123456Z" };
  const orders = await admin.from("orders").insert(rows.map(row => ({ ...common, ...row,
    created_by: staff.userId, kind: "wholesale" as const, status: "draft" as const,
    from_location_id: location.id, sale_channel_id: customer.saleChannelId,
  })));
  if (orders.error) throw orders.error;
  const invoices = await admin.from("invoices").insert(rows.map(({ id, customer_id }) => ({
    ...common, id, customer_id, ...(id === ids[0] ? { paid_at: "2026-09-21T12:00:00Z" } : {}),
  })));
  if (invoices.error) throw invoices.error;
});

for (const name of ["list_orders", "list_invoices", "portal_orders", "portal_invoices"]) {
  it(`${name} traverses tied timestamps without duplicates and keeps customer scope`, async () => {
    const ctx = name.startsWith("portal") ? buyer : staff;
    const input = name.startsWith("portal") ? {} : { customerId, ...(name === "list_orders" ? { status: "draft" } : {}) };
    type Page = { rows: Row[]; nextCursor: string | null };
    const first = await runCommand(name, { ...input, limit: 50 }, ctx) as Page;
    expect(first.rows.map(row => row.id)).toEqual(ids.toReversed().slice(0, 50));
    expect(first).not.toHaveProperty("total");
    const last = first.rows.at(-1)!;
    expect(first.nextCursor).toBe(`${last.created_at}~${last.id}`);
    const next = await runCommand(name, { ...input, limit: 50, cursor: first.nextCursor }, ctx) as Page;
    expect(next.rows.map(row => row.id)).toEqual(ids.toReversed().slice(50));
    expect(next.nextCursor).toBeNull();
    expect([...first.rows, ...next.rows].every(row => row.customer_id === customerId)).toBe(true);
    for (const invalid of [
      { cursor: "bad),customer_id.not.is.null" }, { limit: 0 }, { limit: 201 },
      { page: 0 }, { page: -1 }, { page: 1.5 }, { page: 1_000_001 },
      { page: Number.MAX_SAFE_INTEGER }, { page: Infinity }, { page: "2" },
      { page: 1, cursor: first.nextCursor },
    ]) {
      await expect(runCommand(name, { ...input, ...invalid }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it(`${name} reads a numbered page directly with the exact customer-filtered total`, async () => {
    const ctx = name.startsWith("portal") ? buyer : staff;
    const input = name.startsWith("portal") ? {} : { customerId, ...(name === "list_orders" ? { status: "draft" } : {}) };
    const middle = await runCommand(name, { ...input, page: 2, limit: 20 }, ctx) as NumberedHistoryPage<Row>;
    expect(middle.total).toBe(55);
    expect(middle.rows.map(row => row.id)).toEqual(ids.toReversed().slice(20, 40));
    expect(middle.nextCursor).toBe(`${middle.rows[19].created_at}~${middle.rows[19].id}`);
    expect(middle.rows.every(row => row.customer_id === customerId)).toBe(true);
    const last = await runCommand(name, { ...input, page: 3, limit: 20 }, ctx) as NumberedHistoryPage<Row>;
    expect(last.total).toBe(55);
    expect(last.rows.map(row => row.id)).toEqual(ids.toReversed().slice(40));
    expect(last.nextCursor).toBeNull();
    expect(await runCommand(name, { ...input, page: 1_000_000, limit: 20 }, ctx))
      .toEqual({ rows: [], nextCursor: null, total: 55 });
    if (name === "list_invoices") {
      expect(middle.rows[0]).toMatchObject({ subtotal_cents: 0, total_cents: 0, local_paid_cents: 0, was_pushed_to_qbo: false });
    }
  });
}

it("counts only unpaid invoices before applying the numbered range", async () => {
  const page = await runCommand("list_invoices", { customerId, status: "unpaid", page: 3, limit: 20 }, staff) as NumberedHistoryPage<Row>;
  expect(page.total).toBe(54);
  expect(page.rows.map(row => row.id)).toEqual(ids.toReversed().filter(id => id !== ids[0]).slice(40));
});

it("returns an empty numbered page with zero total when staff filters match nothing", async () => {
  const customerId = crypto.randomUUID();
  for (const name of ["list_orders", "list_invoices"]) {
    expect(await runCommand(name, { customerId, page: 2, limit: 20 }, staff))
      .toEqual({ rows: [], nextCursor: null, total: 0 });
  }
});
