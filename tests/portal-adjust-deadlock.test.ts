// tests/portal-adjust-deadlock.test.ts — issue #1075: a portal quote submit
// and a staff wholesale line raise on the same SKU must not deadlock.
// portal_submit_quote locks the brewery row, then the SKU rows. The raise
// freezes the SKU rows, and its inserts then key-share the brewery row. A
// third session holds the quote's source location, which the submit locks
// between the brewery and the SKUs, so the submit pauses holding the brewery.
// The raise then runs; when the location is released, the two either deadlock
// (40P01) or one waits for the other.
import { afterEach, describe, expect, it } from "vitest";
import {
  asUser, closePgSessions, makeBrewery, makeCustomerUser, makeStaffCtx, pgSession, priceSku,
  seedCatalog, seedCustomer, seedLocation, staffSession,
} from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

afterEach(closePgSessions);

describe("portal submit racing a wholesale line raise (#1075)", { concurrent: false }, () => {
  it("the raise waits for the submit instead of deadlocking", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id, "admin");
    const wh = await seedLocation(b.id);
    const { customerId, shipToId, saleChannelId } = await seedCustomer(b.id);
    const { skuId, brandId, formatId } = await seedCatalog(b.id);
    await priceSku(b.id, { saleChannelId, brandId, formatId, cents: 3600 });
    await runCommand("record_movement", { skuId, locationId: wh.id, binId: wh.binId, qty: 10, type: "opening_balance" }, ctx);
    await runCommand("set_portal_fulfillment_source", { locationId: wh.id }, ctx);
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: wh.id, lines: [{ skuId, qty: 2 }],
    }, ctx) as { order_id: string };
    await runCommand("submit_order", { orderId }, ctx);
    await runCommand("confirm_order", { orderId }, ctx);
    const buyerUser = await makeCustomerUser(customerId);
    const buyer = await asUser(buyerUser.email);
    const quote = await buyer.rpc("portal_quote_order", {
      p_brewery: b.id, p_customer: customerId, p_ship_to: shipToId, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }], p_request_id: crypto.randomUUID(),
    });
    expect(quote.error).toBeNull();
    const quoteId = (quote.data as { quoteId: string }).quoteId;

    const holder = await pgSession();
    const portal = await staffSession(buyerUser.id);
    const staff = await staffSession(ctx.userId);
    const observer = await pgSession();
    const pidOf = async (c: typeof portal) => (await c.query("select pg_backend_pid() pid")).rows[0].pid as number;
    const [portalPid, staffPid] = [await pidOf(portal), await pidOf(staff)];
    const waiting = async (pid: number) =>
      (await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock";

    await holder.query("begin");
    await holder.query("select 1 from public.locations where id=$1 for update", [wh.id]);
    let portalDone = false;
    const submit = portal.query("select public.portal_submit_quote($1,$2,$3,null,$4) result",
      [b.id, customerId, quoteId, crypto.randomUUID()]).finally(() => { portalDone = true; });
    submit.catch(() => {});
    await expect.poll(() => waiting(portalPid), { timeout: 5000 }).toBe(true);
    let staffDone = false;
    const raise = staff.query("select public.adjust_order_lines($1,$2,'raise',$3) result",
      [orderId, JSON.stringify([{ sku_id: skuId, qty: 3 }]), crypto.randomUUID()]).finally(() => { staffDone = true; });
    raise.catch(() => {});
    await expect.poll(() => waiting(staffPid), { timeout: 5000 }).toBe(true);

    await holder.query("commit");
    // A deadlock surfaces as 40P01 after deadlock_timeout (1s); the fix lets
    // the submit finish while the raise keeps waiting for the brewery row.
    await expect.poll(() => portalDone, { timeout: 5000 }).toBe(true);
    await expect(submit, "the submit finishes").resolves.toBeDefined();
    const raiseState = staffDone ? await raise.then(() => "finished", (e: { code?: string }) => e.code) : "waiting";
    expect(raiseState, "the raise waits for the submit").toBe("waiting");
    await portal.query("commit");
    const raised = (await raise).rows[0].result as { order_id: string };
    expect(raised.order_id).toBe(orderId);
  });
});
