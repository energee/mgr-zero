import { beforeAll, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
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
  buyer = { db: await asUser(user.email), userId: user.id, breweryId: brewery.id, role: "customer", customerId };
  const rows = [...ids.map(id => ({ id, customer_id: customerId, ship_to_id: customer.shipToId })),
    { id: crypto.randomUUID(), customer_id: other.customerId, ship_to_id: other.shipToId }];
  const common = { brewery_id: brewery.id, created_at: "2026-09-20T12:00:00.123456Z" };
  const orders = await admin.from("orders").insert(rows.map(row => ({ ...common, ...row,
    created_by: staff.userId, kind: "wholesale" as const, status: "draft" as const,
    from_location_id: location.id, sale_channel_id: customer.saleChannelId,
  })));
  if (orders.error) throw orders.error;
  const invoices = await admin.from("invoices").insert(rows.map(({ id, customer_id }) => ({ ...common, id, customer_id })));
  if (invoices.error) throw invoices.error;
});

for (const name of ["list_orders", "list_invoices", "portal_orders", "portal_invoices"]) {
  it(`${name} traverses tied timestamps without duplicates and keeps customer scope`, async () => {
    const ctx = name.startsWith("portal") ? buyer : staff;
    const input = name.startsWith("portal") ? {} : { customerId, ...(name === "list_orders" ? { status: "draft" } : {}) };
    type Page = { rows: Row[]; nextCursor: string | null };
    const first = await runCommand(name, { ...input, limit: 50 }, ctx) as Page;
    expect(first.rows.map(row => row.id)).toEqual(ids.toReversed().slice(0, 50));
    const last = first.rows.at(-1)!;
    expect(first.nextCursor).toBe(`${last.created_at}~${last.id}`);
    const next = await runCommand(name, { ...input, limit: 50, cursor: first.nextCursor }, ctx) as Page;
    expect(next.rows.map(row => row.id)).toEqual(ids.toReversed().slice(50));
    expect(next.nextCursor).toBeNull();
    expect([...first.rows, ...next.rows].every(row => row.customer_id === customerId)).toBe(true);
    for (const invalid of [{ cursor: "bad),customer_id.not.is.null" }, { limit: 0 }, { limit: 201 }]) {
      await expect(runCommand(name, { ...input, ...invalid }, ctx)).rejects.toThrow(/validation/);
    }
  });
}
