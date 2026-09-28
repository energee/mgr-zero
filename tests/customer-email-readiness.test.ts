import { describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { makeBrewery, makeStaffCtx, seedCustomer, makeCustomerUser, asUser, admin, sql } from "./helpers";

describe("portal-login email readiness", () => {
  it("uses one tenant predicate for missing, blank, corrected, and removed buyer emails", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const missing = (await seedCustomer(brewery.id, { name: "Missing" })).customerId;
    const blank = (await seedCustomer(brewery.id, { name: "Blank" })).customerId;
    const ready = (await seedCustomer(brewery.id, { name: "Ready" })).customerId;
    const blankUser = await makeCustomerUser(blank);
    await makeCustomerUser(ready);
    await seedCustomer((await makeBrewery()).id);
    sql(`update auth.users set email = '   ' where id = '${blankUser.id}'`);
    const ids = async () => (await runCommand("list_customers", { missingPortalEmail: true }, ctx) as { id: string }[]).map(row => row.id).sort();
    expect(await ids()).toEqual([missing, blank].sort());
    expect(await runCommand("count_customers_missing_portal_email", {}, ctx)).toBe(2);
    // Fixture correction models an existing identity receiving an email; the UI never edits Auth globally.
    sql(`update auth.users set email = '${blankUser.email}' where id = '${blankUser.id}'`);
    const buyer = await makeCustomerUser(missing);
    expect(await ids()).toEqual([]);
    expect(await runCommand("count_customers_missing_portal_email", {}, ctx)).toBe(0);
    const removed = await admin.from("customer_users").delete().eq("customer_id", missing).eq("user_id", buyer.id);
    if (removed.error) throw removed.error;
    expect(await ids()).toEqual([missing]);
    expect(await runCommand("count_customers_missing_portal_email", {}, ctx)).toBe(1);
  });

  it("pages the filtered review beyond the API cap while counting the same set", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const ready = await seedCustomer(b.id, { name: "Ready" });
    await makeCustomerUser(ready.customerId);
    const inserted = await admin.from("customers").insert(Array.from({ length: 1003 }, (_, index) => ({ brewery_id: b.id, name: `Missing ${String(index).padStart(4, "0")}`, type: "retailer" as const, state: "PA", sale_channel_id: ready.saleChannelId })));
    if (inserted.error) throw inserted.error;
    const rows = await runCommand("list_customers", { missingPortalEmail: true, includeShipTos: true }, ctx) as { id: string; sale_channels: { name: string }; shipTos: unknown[] }[];
    expect(rows).toHaveLength(1003);
    expect(new Set(rows.map(row => row.id)).size).toBe(1003);
    expect(rows[0].sale_channels.name).toBe("Wholesale");
    expect(rows[0].shipTos).toEqual([]);
    expect(await runCommand("count_customers_missing_portal_email", {}, ctx)).toBe(rows.length);
  });

  it("allows admin/sales and rejects warehouse, buyers, and a foreign tenant", async () => {
    const b = await makeBrewery();
    const customerId = (await seedCustomer(b.id)).customerId;
    const sales = await makeStaffCtx(b.id, "sales");
    expect(await runCommand("count_customers_missing_portal_email", {}, sales)).toBe(1);
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("list_customers", { missingPortalEmail: true }, warehouse)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(runCommand("count_customers_missing_portal_email", {}, warehouse)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await warehouse.db.rpc("customers_missing_portal_email", { p_brewery: b.id })).error?.code).toBe("42501");
    const other = await makeStaffCtx((await makeBrewery()).id);
    expect((await other.db.rpc("customers_missing_portal_email", { p_brewery: b.id })).error?.code).toBe("42501");
    const buyer = await makeCustomerUser(customerId);
    expect((await (await asUser(buyer.email)).rpc("customers_missing_portal_email", { p_brewery: b.id })).error?.code).toBe("42501");
  });
});
