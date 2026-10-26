// tests/commands-orders.test.ts — registry wiring for order commands: roles, validation, rpc passthrough.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedCustomer, priceSku, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>, brewerCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let customerId: string, shipToId: string, whId: string, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  brewerCtx = await makeStaffCtx(b.id, "brewer");
  whId = (await seedLocation(b.id)).id;
  const cat = await seedCatalog(b.id);
  skuId = cat.skuId;
  const cust = await seedCustomer(b.id);
  ({ customerId, shipToId } = cust);
  await priceSku(b.id, { saleChannelId: cust.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 3600 });
});

describe("order commands", () => {
  it("create_order → submit → confirm → get_order shows lines + events", async () => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId,
      lines: [{ skuId, qty: 5 }],
    }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId: created.order_id }, adminCtx);
    await runCommand("confirm_order", { orderId: created.order_id }, adminCtx);
    const full = await runCommand("get_order", { orderId: created.order_id }, adminCtx) as
      { order: { status: string }; lines: unknown[]; events: { event: string }[] };
    expect(full.order.status).toBe("confirmed");
    expect(full.lines.length).toBe(1);
    expect(full.events.map(e => e.event)).toEqual(["created", "submitted", "confirmed"]);
  });
  it("draft edits replace headers and lines and preserve, clear or set requested date", async () => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId,
      requestedShipDate: "2026-10-12", note: "Keep this note", lines: [{ skuId, qty: 5 }],
    }, adminCtx) as { order_id: string };
    const secondShipTo = await runCommand("upsert_ship_to", { customerId, label: "Second dock", city: "Columbus", state: "OH", address1: "42 River St", zip: "43215" }, adminCtx) as { id: string };
    const orderId = created.order_id;
    const edit = { orderId, shipToId: secondShipTo.id, poNumber: "PO-edited", lines: [{ skuId, qty: 2.5 }] };
    await runCommand("update_draft_order", edit, adminCtx);
    const read = () => runCommand("get_order", { orderId }, adminCtx) as Promise<{ order: { status: string; ship_to_id: string; po_number: string; requested_ship_date: string | null; note: string }; lines: { qty_ordered: number; unit_price_cents: number }[] }>;
    const saved = await read();
    expect(saved.order).toMatchObject({ status: "draft", ship_to_id: secondShipTo.id, po_number: "PO-edited", requested_ship_date: "2026-10-12", note: "Keep this note" });
    expect(saved.lines).toHaveLength(1);
    expect(Number(saved.lines[0].qty_ordered)).toBe(2.5);
    expect(saved.lines[0].unit_price_cents).toBe(3600);
    await runCommand("update_draft_order", { ...edit, requestedShipDate: null, poNumber: "" }, adminCtx);
    expect((await read()).order).toMatchObject({ requested_ship_date: null, po_number: "" });
    await runCommand("update_draft_order", { ...edit, requestedShipDate: "2026-10-19" }, adminCtx);
    expect((await read()).order.requested_ship_date).toBe("2026-10-19");
    await runCommand("submit_order", { orderId }, adminCtx);
    await expect(runCommand("update_draft_order", edit, adminCtx)).rejects.toThrow(/order is/);
    await runCommand("confirm_order", { orderId }, adminCtx);
    await expect(runCommand("update_draft_order", edit, adminCtx)).rejects.toThrow(/order is/);
  });
  it("brewer role cannot create orders", async () => {
    await expect(runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }],
    }, brewerCtx)).rejects.toThrow(/permission denied/);
  });
  it("rejects empty lines", async () => {
    await expect(runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [],
    }, adminCtx)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("rejects blank cancellation reasons through commands and direct RPC without changing the draft", async () => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }],
    }, adminCtx) as { order_id: string };
    for (const reason of ["", "   ", "\t\r\n", "\u00a0\u2003"]) {
      await expect(runCommand("cancel_order", { orderId: created.order_id, reason }, adminCtx)).rejects.toMatchObject({ code: "invalid_input" });
      const result = await adminCtx.db.rpc("cancel_order", { p_order: created.order_id, p_reason: reason, p_request_id: crypto.randomUUID() });
      expect(result.error?.code).toBe("22023");
    }
    const unchanged = await runCommand("get_order", { orderId: created.order_id }, adminCtx) as { order: { status: string }; events: { event: string }[] };
    expect(unchanged.order.status).toBe("draft");
    expect(unchanged.events.map(event => event.event)).toEqual(["created"]);
  });

  it("trims a new cancellation reason and preserves the raw request identity on replay", async () => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }],
    }, adminCtx) as { order_id: string };
    const input = { orderId: created.order_id, reason: " \tCustomer changed plans\n " };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const first = await runCommand("cancel_order", input, adminCtx, execution);
    expect(await runCommand("cancel_order", input, adminCtx, execution)).toEqual(first);
    await expect(runCommand("cancel_order", { ...input, reason: input.reason.trim() }, adminCtx, execution)).rejects.toThrow();
    const saved = await runCommand("get_order", { orderId: created.order_id }, adminCtx) as { order: { status: string }; events: { event: string; payload: { reason?: string } }[] };
    expect(saved.order.status).toBe("cancelled");
    expect(saved.events.filter(event => event.event === "cancelled")).toEqual([expect.objectContaining({ payload: { reason: "Customer changed plans" } })]);
  });

  it.each(["   ", " \tHistorical reason\n "])("replays historical raw cancellation reason %j before new-write validation", async reason => {
    const created = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 1 }],
    }, adminCtx) as { order_id: string };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const payload = JSON.stringify({ order: created.order_id, reason }).replaceAll("'", "''");
    const result = { order_id: created.order_id };
    sql(`
      select private.claim_command_request_for('${adminCtx.userId}', '${b.id}', 'cancel_order', '${execution.requestId}', '${payload}'::jsonb);
      update public.orders set status = 'cancelled' where id = '${created.order_id}';
      select private.complete_command_request_for('${adminCtx.userId}', '${execution.requestId}', '${JSON.stringify(result)}'::jsonb);
    `, true);
    expect(await runCommand("cancel_order", { orderId: created.order_id, reason }, adminCtx, execution)).toEqual(result);
  });

  it("list_orders filters by status", async () => {
    const { rows } = await runCommand("list_orders", { status: "confirmed" }, adminCtx) as { rows: { status: string }[] };
    expect(rows.every(r => r.status === "confirmed")).toBe(true);
  });
});

describe("adjustment reasons", () => {
  async function orderAt(status: "submitted" | "confirmed" | "picked") {
    const { order_id: orderId } = await runCommand("create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: whId, lines: [{ skuId, qty: 5 }],
    }, adminCtx) as { order_id: string };
    await runCommand("submit_order", { orderId }, adminCtx);
    if (status !== "submitted") await runCommand("confirm_order", { orderId }, adminCtx);
    if (status === "picked") {
      const lineId = sql(`select id from public.order_lines where order_id='${orderId}'`)[0];
      await runCommand("record_pick", { orderId, picks: [{ lineId, qty: 5 }] }, adminCtx);
    }
    return orderId;
  }

  function snapshot(orderId: string) {
    return sql(`select jsonb_build_object(
      'order', (select to_jsonb(o) from public.orders o where id='${orderId}'),
      'lines', (select jsonb_agg(to_jsonb(l) order by id) from public.order_lines l where order_id='${orderId}'),
      'allocations', (select jsonb_agg(to_jsonb(a) order by id) from public.allocations a where ref in (select id from public.order_lines where order_id='${orderId}')),
      'events', (select jsonb_agg(to_jsonb(e) order by id) from public.order_events e where order_id='${orderId}'),
      'deposits', (select jsonb_agg(to_jsonb(d) order by id) from public.order_deposit_lines d where order_id='${orderId}')
    )::text`);
  }

  it.each(["submitted", "confirmed", "picked"] as const)("refuses blank reasons atomically on a %s order through commands and RPC", async status => {
    const orderId = await orderAt(status);
    const before = snapshot(orderId);
    for (const reason of ["", "   ", "\t\r\n", "\u00a0\u2003", "\ufeff\u3000"]) {
      const requestId = crypto.randomUUID();
      await expect(runCommand("adjust_order_lines", { orderId, reason, lines: [{ skuId, qty: 2 }] }, adminCtx, { requestId, correlationId: requestId }))
        .rejects.toMatchObject({ code: "invalid_input" });
      expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
      const rpc = await adminCtx.db.rpc("adjust_order_lines", {
        p_order: orderId, p_lines: [{ sku_id: skuId, qty: 2 }], p_reason: reason, p_request_id: requestId,
      });
      expect(rpc.error).toMatchObject({ code: "22023", message: "a reason is required" });
      expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
      expect(snapshot(orderId)).toEqual(before);
    }
    expect(() => sql(`set local role authenticated; set local request.jwt.claim.sub='${adminCtx.userId}';
      select public.adjust_order_lines('${orderId}', '[{"sku_id":"${skuId}","qty":2}]', null, '${crypto.randomUUID()}')`, true))
      .toThrow(/a reason is required/);
    expect(snapshot(orderId)).toEqual(before);
  });

  it.each(["command", "rpc"] as const)("stores trimmed valid reasons through %s and replays the original payload", async path => {
    const orderId = await orderAt("confirmed");
    const reason = " \t\u00a0Customer cut\u2003\n ";
    const requestId = crypto.randomUUID();
    const input = { orderId, reason, lines: [{ skuId, qty: 2 }] };
    const invoke = () => path === "command"
      ? runCommand("adjust_order_lines", input, adminCtx, { requestId, correlationId: requestId })
      : adminCtx.db.rpc("adjust_order_lines", { p_order: orderId, p_lines: [{ sku_id: skuId, qty: 2 }], p_reason: reason, p_request_id: requestId }).then(result => { expect(result.error).toBeNull(); return result.data; });
    const saved = await invoke();
    expect(await invoke()).toEqual(saved);
    expect(sql(`select payload->>'reason' from public.order_events where order_id='${orderId}' and event='lines_adjusted'`)).toEqual(["Customer cut"]);
    expect(sql(`select qty_ordered from public.order_lines where order_id='${orderId}'`)).toEqual(["2.00"]);
    await expect(runCommand("adjust_order_lines", { ...input, reason: "Customer cut" }, adminCtx, { requestId, correlationId: requestId })).rejects.toMatchObject({ code: "conflict" });
  });

  it.each(["   ", " \tOriginal reason\n "])("replays historical raw reason %j before new-write validation", async reason => {
    const orderId = await orderAt("submitted");
    const requestId = crypto.randomUUID();
    const payload = { order: orderId, lines: [{ sku_id: skuId, qty: 2 }], reason };
    const result = { order_id: orderId, warnings: [], historical: true };
    sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
      values('${adminCtx.userId}','${b.id}','${requestId}','adjust_order_lines',
        extensions.digest('${JSON.stringify(payload)}'::jsonb::text,'sha256'),'${JSON.stringify(result)}'::jsonb)`);
    const before = snapshot(orderId);
    expect(await runCommand("adjust_order_lines", { orderId, reason, lines: [{ skuId, qty: 2 }] }, adminCtx, { requestId, correlationId: requestId })).toEqual(result);
    const rpc = await adminCtx.db.rpc("adjust_order_lines", { p_order: orderId, p_lines: payload.lines, p_reason: reason, p_request_id: requestId });
    expect(rpc.error).toBeNull();
    expect(rpc.data).toEqual(result);
    expect(snapshot(orderId)).toEqual(before);
  });
});

describe("taproom pars", () => {
  it("par 0 removes the replenishment target (#472)", async () => {
    const tap = await seedLocation(b.id, { name: "Tap par", uses: ["taproom"] });
    await runCommand("set_taproom_par", { locationId: tap.id, skuId, parQty: 4 }, adminCtx);
    const before = await runCommand("replenishment_suggestions", { locationId: tap.id }, adminCtx) as { skuId: string; par: number }[];
    expect(before.map(s => [s.skuId, s.par])).toEqual([[skuId, 4]]);
    await runCommand("set_taproom_par", { locationId: tap.id, skuId, parQty: 0 }, adminCtx);
    expect(await runCommand("replenishment_suggestions", { locationId: tap.id }, adminCtx)).toEqual([]);
  });
});

describe("standing taproom allocations", () => {
  it("concurrent sets for the same (location, sku) leave exactly one open allocation", async () => {
    const tap = await seedLocation(b.id, { name: "Tap race", uses: ["taproom"] });
    await Promise.all([
      runCommand("set_standing_allocation", { locationId: tap.id, skuId, qty: 3 }, adminCtx),
      runCommand("set_standing_allocation", { locationId: tap.id, skuId, qty: 5 }, adminCtx),
    ]);
    const { data: open } = await admin.from("allocations").select("id")
      .eq("source", "taproom_standing").eq("ref", tap.id).eq("sku_id", skuId).eq("status", "open");
    expect(open!.length).toBe(1);
  });

  it("set creates an open allocation, shows in list, and reduces ATP; qty 0 releases it", async () => {
    const tap = await seedLocation(b.id, { name: "Tap", uses: ["taproom"] });
    const tapId = tap.id;
    await ins("inventory_movements", {
      brewery_id: b.id, sku_id: skuId, location_id: tapId, bin_id: tap.binId, qty: 20, type: "opening_balance", created_by: adminCtx.userId,
    });
    const atpBefore = await runCommand("get_atp", { skuId }, adminCtx) as { sku_id: string; qty: number }[];
    const before = atpBefore.find(r => r.sku_id === skuId)!.qty;

    const set = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 6 }, adminCtx) as { allocation_id: string; status: string };
    expect(set.status).toBe("open");

    const list = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as { id: string; sku_id: string; qty: number }[];
    expect(list.some(a => a.id === set.allocation_id && a.sku_id === skuId && Number(a.qty) === 6)).toBe(true);

    const atpAfter = await runCommand("get_atp", { skuId }, adminCtx) as { sku_id: string; qty: number }[];
    const after = atpAfter.find(r => r.sku_id === skuId)!.qty;
    expect(Number(after)).toBe(Number(before) - 6);

    // Setting again updates the same row rather than creating a second one.
    const setAgain = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 9 }, adminCtx) as { allocation_id: string; status: string };
    expect(setAgain.allocation_id).toBe(set.allocation_id);
    const listAgain = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as { id: string; qty: number }[];
    expect(listAgain.length).toBe(1);
    expect(Number(listAgain[0].qty)).toBe(9);

    const released = await runCommand("set_standing_allocation", { locationId: tapId, skuId, qty: 0 }, adminCtx) as { status: string };
    expect(released.status).toBe("released");
    const listAfterRelease = await runCommand("list_standing_allocations", { locationId: tapId }, adminCtx) as unknown[];
    expect(listAfterRelease.length).toBe(0);
  });

  it("brewer role cannot set standing allocations", async () => {
    const tap = await seedLocation(b.id, { name: "Tap2", uses: ["taproom"] });
    await expect(runCommand("set_standing_allocation", { locationId: tap.id, skuId, qty: 1 }, brewerCtx)).rejects.toThrow(/permission denied/);
  });
});
