import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database";
import type { Ctx } from "@/lib/commands/registry";
import {
  admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku,
  seedCatalog, seedCustomer, seedLocation, sql,
} from "./helpers";

let breweryId: string, customerId: string, shipToId: string, skuId: string;
let fromLocationId: string, toLocationId: string, draftId: string;
let buyer: SupabaseClient<Database>;
let staff: Ctx;

const invalidPortalQuantities: Json[] = [
  "NaN", "Infinity", "-Infinity", "abc", "2", null, 0, -1, 1.5, true, {}, [],
];
const orderResult = z.object({ order_id: z.string().uuid() });
const lines = (qty: Json) => [{ sku_id: skuId, qty }];
const portalArgs = (qty: Json, requestId = crypto.randomUUID()) => ({
  p_brewery: breweryId, p_customer: customerId, p_ship_to: shipToId,
  p_requested: null, p_po: "quantity regression", p_note: null,
  p_lines: lines(qty), p_request_id: requestId,
});
const staffArgs = (qty: Json) => ({
  ...portalArgs(qty), p_kind: "wholesale" as const,
  p_from_location: fromLocationId, p_to_location: null,
});

// Read through the database owner: buyers cannot inspect the private request
// ledger or base order lines. Compare rows, not counts, to catch partial edits.
function persistedState() {
  return sql(`select jsonb_build_object(${[
    "public.orders", "public.order_lines", "public.allocations", "public.order_events",
    "private.command_requests", "private.portal_order_quotes",
  ].map(table => `'${table}', (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb)
      from ${table} r where brewery_id = '${breweryId}')`).join(",")})::text`, true);
}

async function createDraft(qty: Json = 2) {
  const result = await buyer.rpc("portal_create_order", portalArgs(qty));
  expect(result.error).toBeNull();
  return orderResult.parse(result.data).order_id;
}

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  staff = await makeStaffCtx(breweryId, "admin");
  fromLocationId = (await seedLocation(breweryId)).id;
  toLocationId = (await seedLocation(breweryId, { name: "Taproom", uses: ["taproom"] })).id;
  const catalog = await seedCatalog(breweryId);
  skuId = catalog.skuId;
  const customer = await seedCustomer(breweryId);
  ({ customerId, shipToId } = customer);
  await priceSku(breweryId, { ...catalog, saleChannelId: customer.saleChannelId, cents: 3600 });
  const source = await staff.db.rpc("set_portal_fulfillment_source", {
    p_brewery: breweryId, p_location: fromLocationId, p_request_id: crypto.randomUUID(),
  });
  expect(source.error).toBeNull();
  buyer = await asUser((await makeCustomerUser(customerId)).email);
  draftId = await createDraft();
});

describe("direct buyer order quantity boundary", () => {
  it.each(invalidPortalQuantities.map(qty => [JSON.stringify(qty), qty] as const))(
    "rejects %s on create, both update scopes, and quote without persisting effects",
    async (_label, qty) => {
      const before = persistedState();
      const expectedError = qty === 1.5 ? /whole packaged units/ : /positive finite numbers/;
      const created = await buyer.rpc("portal_create_order", portalArgs(qty));
      expect(created.error?.message).toMatch(expectedError);
      expect(persistedState()).toEqual(before);

      for (const scope of [{}, { p_expected_brewery: breweryId, p_expected_customer: customerId }]) {
        const updated = await buyer.rpc("update_draft_order", {
          p_order: draftId, p_ship_to: shipToId, p_requested: "2026-11-01",
          p_po: "must not persist", p_note: "must not persist", p_lines: lines(qty),
          p_request_id: crypto.randomUUID(), ...scope,
        });
        expect(updated.error?.message).toMatch(expectedError);
        expect(persistedState()).toEqual(before);
      }

      const quoted = await buyer.rpc("portal_quote_order", portalArgs(qty));
      expect(quoted.error?.message).toMatch(qty === 1.5 ? /positive whole quantity/ : /positive finite numbers/);
      expect(persistedState()).toEqual(before);
    },
  );

  it("rejects missing quantities and nonempty-array violations", async () => {
    const before = persistedState();
    for (const malformed of [null, [], {}, [{ sku_id: skuId }]]) {
      const created = await buyer.rpc("portal_create_order", { ...portalArgs(2), p_lines: malformed });
      expect(created.error).not.toBeNull();
      const updated = await buyer.rpc("update_draft_order", {
        p_order: draftId, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
        p_lines: malformed, p_request_id: crypto.randomUUID(),
      });
      expect(updated.error).not.toBeNull();
      expect(persistedState()).toEqual(before);
    }
  });

  it("keeps valid whole quantities through create, update, submit and staff allocation", async () => {
    const orderId = await createDraft();
    const requestId = crypto.randomUUID();
    const update = await buyer.rpc("update_draft_order", {
      p_order: orderId, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
      p_lines: lines(2), p_request_id: requestId,
    });
    expect(update.error).toBeNull();
    expect(sql(`select qty_ordered::text from public.order_lines where order_id='${orderId}'`, true)).toEqual(["2.00"]);
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`, true)).toEqual(["1"]);
    const submit = await buyer.rpc("submit_order", { p_order: orderId, p_request_id: crypto.randomUUID() });
    expect(submit.error).toBeNull();
    const confirm = await staff.db.rpc("confirm_order", { p_order: orderId, p_request_id: crypto.randomUUID() });
    expect(confirm.error).toBeNull();
    expect(sql(`select a.qty::text from public.allocations a join public.order_lines l on a.ref=l.id
      where l.order_id='${orderId}' and a.source='order_line' and a.status='open'`, true)).toEqual(["2.00"]);
  });
});

describe("shared staff and transfer order quantity boundary", () => {
  it("preserves fractional staff creates, draft edits, confirmed adjustments and taproom transfers", async () => {
    const created = await staff.db.rpc("create_order", staffArgs(1.25));
    expect(created.error).toBeNull();
    const orderId = orderResult.parse(created.data).order_id;
    const update = await staff.db.rpc("update_draft_order", {
      p_order: orderId, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
      p_lines: lines(1.5), p_request_id: crypto.randomUUID(),
    });
    expect(update.error).toBeNull();
    expect((await staff.db.rpc("submit_order", { p_order: orderId, p_request_id: crypto.randomUUID() })).error).toBeNull();
    expect((await staff.db.rpc("confirm_order", { p_order: orderId, p_request_id: crypto.randomUUID() })).error).toBeNull();
    const adjust = await staff.db.rpc("adjust_order_lines", {
      p_order: orderId, p_lines: lines(2.5), p_reason: "fractional staff order", p_request_id: crypto.randomUUID(),
    });
    expect(adjust.error).toBeNull();
    expect(sql(`select qty_ordered::text from public.order_lines where order_id='${orderId}'`, true)).toEqual(["2.50"]);
    expect(sql(`select a.qty::text from public.allocations a join public.order_lines l on a.ref=l.id
      where l.order_id='${orderId}' and a.status='open'`, true)).toEqual(["2.50"]);

    const transfer = await staff.db.rpc("create_order", {
      ...staffArgs(1.25), p_kind: "taproom_transfer", p_customer: null, p_ship_to: null, p_to_location: toLocationId,
    });
    expect(transfer.error).toBeNull();
    const transferId = orderResult.parse(transfer.data).order_id;
    expect(sql(`select qty_ordered::text from public.order_lines where order_id='${transferId}'`, true)).toEqual(["1.25"]);

    const before = persistedState();
    for (const qty of ["NaN", "Infinity", "abc", "2", null, 0, -1]) {
      expect((await staff.db.rpc("create_order", staffArgs(qty))).error).not.toBeNull();
      expect((await staff.db.rpc("update_draft_order", {
        p_order: draftId, p_ship_to: null, p_requested: null, p_po: null, p_note: null,
        p_lines: lines(qty), p_request_id: crypto.randomUUID(),
      })).error).not.toBeNull();
      expect((await staff.db.rpc("adjust_order_lines", {
        p_order: orderId, p_lines: lines(qty), p_reason: "invalid quantity", p_request_id: crypto.randomUUID(),
      })).error).not.toBeNull();
      expect(persistedState()).toEqual(before);
    }
  });
});

describe("finite order and allocation storage invariants", () => {
  it("rejects NaN inserts and updates even through a privileged storage writer", async () => {
    const orderId = await createDraft();
    const lineId = sql(`select id from public.order_lines where order_id='${orderId}'`, true)[0];
    const before = persistedState();
    const writes = [
      `update public.order_lines set qty_ordered='NaN' where id='${lineId}'`,
      `insert into public.order_lines(brewery_id,order_id,sku_id,qty_ordered,unit_price_cents)
        values('${breweryId}','${orderId}','${skuId}','NaN',3600)`,
      `insert into public.allocations(brewery_id,sku_id,qty,source,ref)
        values('${breweryId}','${skuId}','NaN','order_line','${lineId}')`,
    ];
    for (const query of writes) {
      expect(() => sql(query, true, "sqlstate")).toThrow(/23514/);
      expect(persistedState()).toEqual(before);
    }
    const allocation = await admin.from("allocations").insert({
      brewery_id: breweryId, sku_id: skuId, qty: 2, source: "order_line", ref: lineId,
    }).select("id").single();
    expect(allocation.error).toBeNull();
    const allocated = persistedState();
    expect(() => sql(`update public.allocations set qty='NaN' where id='${allocation.data!.id}'`, true, "sqlstate")).toThrow(/23514/);
    expect(persistedState()).toEqual(allocated);
  });
});
