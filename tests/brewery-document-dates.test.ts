import { expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Fixture = {
  brewery: { id: string };
  ctx: Ctx;
  location: { id: string; binId: string };
  zone: string;
  today: string;
  utcDay: string;
  due: string;
};

async function fixture(): Promise<Fixture> {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id);
  const location = await seedLocation(brewery.id);
  // At least one of these real zones is on a different date from UTC at any hour.
  const [zone, today, utcDay, due] = sql(`select concat_ws('|', zone,
    (now() at time zone zone)::date, (now() at time zone 'UTC')::date,
    (now() at time zone zone)::date + 30)
    from (values ('Pacific/Kiritimati'), ('Pacific/Pago_Pago')) zones(zone)
    where (now() at time zone zone)::date <> (now() at time zone 'UTC')::date limit 1`, true)[0].split("|");
  sql(`update breweries set timezone='${zone}' where id='${brewery.id}'`);
  expect(today).not.toBe(utcDay);
  return { brewery, ctx, location, zone, today, utcDay, due };
}

async function shipment(f: Fixture, invoiceTiming: "now" | "on_delivery", returnableKegs = false) {
  const customer = await seedCustomer(f.brewery.id);
  expect((await admin.from("customers").update({ payment_terms: "net30" }).eq("id", customer.customerId)).error).toBeNull();
  const catalog = await seedCatalog(f.brewery.id, { bblPerUnit: 0.5, ...(returnableKegs ? { packageType: "keg" } : {}) });
  if (returnableKegs) {
    const pool = await ins("keg_pools", { brewery_id: f.brewery.id, name: "Posting fleet", kind: "owned", deposit_cents: 2500 });
    expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.id }).eq("id", catalog.skuId)).error).toBeNull();
  }
  await priceSku(f.brewery.id, { ...catalog, saleChannelId: customer.saleChannelId, cents: 1000 });
  await ins("inventory_movements", { brewery_id: f.brewery.id, sku_id: catalog.skuId,
    location_id: f.location.id, bin_id: f.location.binId, qty: 4, type: "opening_balance", created_by: f.ctx.userId });
  const { order_id: orderId } = await runCommand("create_order", { kind: "wholesale", ...customer,
    fromLocationId: f.location.id, lines: [{ skuId: catalog.skuId, qty: 2 }] }, f.ctx) as { order_id: string };
  await runCommand("submit_order", { orderId }, f.ctx);
  await runCommand("confirm_order", { orderId }, f.ctx);
  const line = (await admin.from("order_lines").select("id").eq("order_id", orderId).single()).data!;
  await runCommand("record_pick", { orderId, picks: [{ lineId: line.id, qty: 2 }] }, f.ctx);
  const input = { orderId, invoiceTiming, ship: [{ lineId: line.id, qty: 2 }] };
  const requestId = crypto.randomUUID();
  const execution = { requestId, correlationId: requestId };
  const result = await runCommand("ship_order", input, f.ctx, execution) as { invoice_id: string | null };
  expect(await runCommand("ship_order", input, f.ctx, execution)).toEqual(result);
  const sh = (await admin.from("shipments").select("id").eq("order_id", orderId).single()).data!;
  return { ...customer, ...catalog, orderId, shipmentId: sh.id, invoiceId: result.invoice_id, requestId };
}

it("dates shipment dollars, due date and QuickBooks on the same local day as removal volume", async () => {
  const f = await fixture();
  const shipped = await shipment(f, "now");
  expect(sql(`select concat_ws('|', i.issued_on, i.due_on, m.occurred_on)
    from invoices i join inventory_movements m on m.ref='${shipped.orderId}' and m.type='sale_removal'
    where i.id='${shipped.invoiceId}'`, true)).toEqual([`${f.today}|${f.due}|${f.today}`]);
  expect(JSON.parse(sql(`select json_build_array(sum(volume_bbl), sum(sales_cents))::text
    from private.destination_state_facts('${f.brewery.id}', '${f.today}', '${f.today}')`, true)[0])).toEqual([1, 2000]);
  expect(sql(`select count(*) from private.destination_state_facts('${f.brewery.id}', '${f.utcDay}', '${f.utcDay}')`, true)).toEqual(["0"]);

  const connection = await ins("qbo_connections", { brewery_id: f.brewery.id,
    realm_id: `realm-${crypto.randomUUID()}`, state: "connected" });
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
    values('${f.brewery.id}','qbo','${connection.id}','local-test-access','local-test-refresh')`);
  expect((await f.ctx.db.rpc("set_qbo_customer_mapping", { p_brewery: f.brewery.id,
    p_customer: shipped.customerId, p_qbo_customer_id: "customer-local", p_request_id: crypto.randomUUID() })).error).toBeNull();
  expect((await f.ctx.db.rpc("set_qbo_item_mapping", { p_brewery: f.brewery.id,
    p_sku: shipped.skuId, p_qbo_item_id: "item-local", p_request_id: crypto.randomUUID() })).error).toBeNull();
  expect((await f.ctx.db.rpc("start_qbo_push", { p_brewery: f.brewery.id, p_invoice: shipped.invoiceId!,
    p_new_attempt_reason: null, p_request_id: crypto.randomUUID() })).error).toBeNull();
  expect(sql(`select (request_body::jsonb->>'TxnDate') || '|' || (request_body::jsonb->>'DueDate')
    from qbo_pushes where invoice_id='${shipped.invoiceId}'`, true)).toEqual([`${f.today}|${f.due}`]);

  const original = (await admin.from("invoice_lines").select("id").eq("invoice_id", shipped.invoiceId!).eq("kind", "sku").single()).data!;
  const credit = await runCommand("create_credit_memo", { invoiceId: shipped.invoiceId,
    locationId: f.location.id, reason: "Returned beer", lines: [{ invoiceLineId: original.id, qty: 1 }] }, f.ctx) as { invoice_id: string };
  expect(sql(`select concat_ws('|', i.issued_on, coalesce(i.due_on::text,'null'), m.occurred_on)
    from invoices i join inventory_movements m on m.ref=i.id and m.type='return_in'
    where i.id='${credit.invoice_id}'`, true)).toEqual([`${f.today}|null|${f.today}`]);
});

it("retains one post-lock posting instant for brewery-local invoices, stock and keg events", async () => {
  const f = await fixture();
  const shipped = await shipment(f, "now", true);
  expect(sql(`select (sh.shipped_at > request.created_at
      and sh.shipped_at=sh.created_at and sh.shipped_at=o.shipped_at
      and sh.shipped_at=i.created_at and sh.shipped_at=m.created_at
      and sh.shipped_at=k.at and sh.shipped_at=k.created_at
      and i.issued_on=(sh.shipped_at at time zone b.timezone)::date
      and m.occurred_on=i.issued_on)::text
    from shipments sh join orders o on o.id=sh.order_id
    join breweries b on b.id=sh.brewery_id
    join invoices i on i.shipment_id=sh.id
    join inventory_movements m on m.ref=o.id and m.type='sale_removal'
    join keg_events k on k.shipment_id=sh.id and k.reason='shipped'
    join private.command_requests request on request.request_id='${shipped.requestId}' and request.actor_id='${f.ctx.userId}'
    where sh.id='${shipped.shipmentId}'`, true)).toEqual(["true"]);
});

it("keeps exact receipt quantities and actual cost together with brewery-local dates", async () => {
  const f = await fixture();
  const vendor = await runCommand("upsert_vendor", { name: "Precision supplier" }, f.ctx) as { id: string };
  const material = await runCommand("upsert_material", { name: "Precision hops", category: "hop",
    baseUom: "lb", purchaseUom: "each", purchaseUomFactor: 2.5, lotTracked: true }, f.ctx) as { id: string };
  const po = await runCommand("create_purchase_order", { vendorId: vendor.id,
    lines: [{ materialId: material.id, qtyOrdered: 2, unitCostCents: 1000 }] }, f.ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
  const line = (await admin.from("purchase_order_lines").select("id").eq("po_id", po.id).single()).data!;
  const input = { p_brewery: f.brewery.id, p_po: po.id, p_location: f.location.id,
    p_bin: f.location.binId, p_received_on: null };
  for (const qty of [0.00001, 0.0001]) {
    const refused = await f.ctx.db.rpc("receive_purchase_order", { ...input, p_request_id: crypto.randomUUID(),
      p_lines: [{ po_line_id: line.id, qty_counted: qty, lot_code: "PRECISE", unit_cost_cents: 1250 }] });
    expect(refused.error).not.toBeNull();
    expect(sql(`select count(*) from receipts where po_id='${po.id}';
      select count(*) from material_movements where material_id='${material.id}'`, true)).toEqual(["0", "0"]);
  }
  const request = { ...input, p_request_id: crypto.randomUUID(),
    p_lines: [{ po_line_id: line.id, qty_counted: 1.2, lot_code: "PRECISE", unit_cost_cents: 1250 }] };
  const received = await f.ctx.db.rpc("receive_purchase_order", request);
  expect(received.error).toBeNull();
  expect((await f.ctx.db.rpc("receive_purchase_order", request)).data).toEqual(received.data);
  expect(JSON.parse(sql(`select json_build_array(rl.qty_counted,m.qty,rl.purchase_unit_cost_cents,m.unit_cost_cents,
      r.received_on,rl.lot_received_on,pol.unit_cost_cents)::text
    from receipts r join receipt_lines rl on rl.receipt_id=r.id
    join material_movements m on m.id=rl.movement_id
    join purchase_order_lines pol on pol.id=rl.po_line_id where r.po_id='${po.id}'`, true)[0]))
    .toEqual([1.2, 3, 1250, 500, f.today, f.today, 1000]);
});

it("keeps every new lot on the saved receipt day if the brewery timezone changes during receiving", async () => {
  const f = await fixture();
  const vendor = await runCommand("upsert_vendor", { name: "Date-bound supplier" }, f.ctx) as { id: string };
  const materials = [];
  for (const name of ["First hops", "Second hops"]) {
    materials.push(await runCommand("upsert_material", { name, category: "hop",
      baseUom: "lb", purchaseUom: "lb", lotTracked: true }, f.ctx) as { id: string });
  }
  const po = await runCommand("create_purchase_order", { vendorId: vendor.id,
    lines: materials.map(material => ({ materialId: material.id, qtyOrdered: 1 })) }, f.ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
  const lines = (await admin.from("purchase_order_lines").select("id").eq("po_id", po.id)).data!;
  const received = lines.map(line => ({ po_line_id: line.id, qty_counted: 1, lot_code: "SAVED-DAY" }));
  // Change real metadata between the receipt and lot inserts; transaction rollback removes the trigger and all writes.
  expect(sql(`begin;
    create function pg_temp.change_receipt_timezone() returns trigger language plpgsql as $$
    begin
      update public.breweries set timezone='UTC' where id=new.brewery_id;
      return new;
    end $$;
    create trigger test_receipt_timezone after insert on public.receipts
      for each row when (new.brewery_id='${f.brewery.id}') execute function pg_temp.change_receipt_timezone();
    do $$ begin
      perform set_config('request.jwt.claim.sub','${f.ctx.userId}',true);
      perform public.receive_purchase_order('${f.brewery.id}','${po.id}','${f.location.id}','${f.location.binId}',
        null,'${JSON.stringify(received)}'::jsonb,'${crypto.randomUUID()}');
    end $$;
    select concat_ws('|',r.received_on,l.lot_received_on,ml.received_on)
      from public.receipts r join public.receipt_lines l on l.receipt_id=r.id
      join public.material_lots ml on ml.id=l.lot_id where r.po_id='${po.id}';
    rollback;`, true)).toEqual(Array(2).fill(`${f.today}|${f.today}|${f.today}`));
});

it("dates invoices created on delivery in the brewery timezone", async () => {
  const f = await fixture();
  const shipped = await shipment(f, "on_delivery");
  expect(shipped.invoiceId).toBeNull();
  const { routeId } = await runCommand("save_route", { name: "Local day", deliveryDate: f.today,
    driverUserId: f.ctx.userId, stops: [{ shipmentId: shipped.shipmentId, stopNo: 1 }] }, f.ctx) as { routeId: string };
  await runCommand("depart_route", { routeId }, f.ctx);
  const delivery = (await admin.from("deliveries").select("id").eq("route_id", routeId).single()).data!;
  const result = await runCommand("confirm_delivery", { deliveryId: delivery.id, signedBy: "Receiver" }, f.ctx) as { invoice_id: string };
  expect(sql(`select concat_ws('|', issued_on, due_on) from invoices where id='${result.invoice_id}'`, true))
    .toEqual([`${f.today}|${f.due}`]);
});

it("defaults receipt, lot and count dates locally while retaining explicitly entered dates", async () => {
  const f = await fixture();
  const vendor = await runCommand("upsert_vendor", { name: "Local day supplier" }, f.ctx) as { id: string };
  const material = await runCommand("upsert_material", { name: "Local day hops", category: "hop",
    baseUom: "lb", purchaseUom: "lb", lotTracked: true }, f.ctx) as { id: string };
  const po = await runCommand("create_purchase_order", { vendorId: vendor.id,
    lines: [{ materialId: material.id, qtyOrdered: 4 }] }, f.ctx) as { id: string };
  await runCommand("send_purchase_order", { poId: po.id, sentVia: "external" }, f.ctx);
  const line = (await admin.from("purchase_order_lines").select("id").eq("po_id", po.id).single()).data!;
  for (const [index, receivedOn] of [undefined, "2026-01-15"].entries()) {
    const result = await runCommand("receive_purchase_order", { poId: po.id, locationId: f.location.id,
      binId: f.location.binId, ...(receivedOn ? { receivedOn } : {}),
      lines: [{ poLineId: line.id, qtyCounted: 2, lotCode: `LOCAL-${index}` }] }, f.ctx) as { receipt_id: string };
    expect(sql(`select r.received_on::text || '|' || l.lot_received_on::text from receipts r
      join receipt_lines l on l.receipt_id=r.id where r.id='${result.receipt_id}'`, true))
      .toEqual([`${receivedOn ?? f.today}|${receivedOn ?? f.today}`]);
  }
  const input = { locationId: f.location.id, binId: f.location.binId, lines: [{ materialId: material.id, qty: 4 }] };
  for (const countedOn of [undefined, "2026-01-16"]) {
    const plan = await runCommand("get_material_count_preview", input, f.ctx) as { revision: string };
    const count = await runCommand("record_material_count", { ...input, revision: plan.revision,
      ...(countedOn ? { countedOn } : {}) }, f.ctx) as { counted_on: string };
    expect(count.counted_on).toBe(countedOn ?? f.today);
  }
  for (const explicit of [undefined, "2026-01-17"]) {
    const receipt = await ins<{ received_on: string }>("receipts", {
      brewery_id: f.brewery.id, po_id: po.id, received_by: f.ctx.userId,
      ...(explicit ? { received_on: explicit } : {}),
    });
    const count = await ins<{ counted_on: string }>("material_counts", {
      brewery_id: f.brewery.id, location_id: f.location.id, bin_id: f.location.binId, counted_by: f.ctx.userId,
      ...(explicit ? { counted_on: explicit } : {}),
    });
    expect(receipt.received_on).toBe(explicit ?? f.today);
    expect(count.counted_on).toBe(explicit ?? f.today);
  }
});

it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago"])("uses %s for omitted insert dates independently of the session and freezes them", async zone => {
  const f = await fixture();
  const customer = await seedCustomer(f.brewery.id);
  expect(sql(`begin;
    set local timezone='UTC';
    update customers set payment_terms='net30' where id='${customer.customerId}';
    update breweries set timezone='${zone}' where id='${f.brewery.id}';
    insert into invoices(brewery_id,customer_id) values('${f.brewery.id}','${customer.customerId}');
    select (issued_on=(now() at time zone '${zone}')::date and due_on=issued_on+30)::text
      from invoices where brewery_id='${f.brewery.id}';
    update breweries set timezone='UTC' where id='${f.brewery.id}';
    select (issued_on=(now() at time zone '${zone}')::date)::text from invoices where brewery_id='${f.brewery.id}';
    insert into invoices(brewery_id,customer_id,issued_on,due_on)
      values('${f.brewery.id}','${customer.customerId}','2026-01-01','2026-02-01');
    select (issued_on='2026-01-01' and due_on='2026-02-01')::text
      from invoices where brewery_id='${f.brewery.id}' and issued_on='2026-01-01';
    rollback;`, true)).toEqual(["true", "true", "true"]);
});
