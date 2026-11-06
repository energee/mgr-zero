// tests/agent-eval-seed.ts — the fixed brewery behind the read evals in
// tests/fixtures/agent-evals.json. Every value a case expects is set here, and
// tests/agent-eval-seed.test.ts proves each one is reachable by that case's role.
import { admin, makeBrewery, makeStaff, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";

async function row(table: string, values: Record<string, unknown>) {
  const { data, error } = await (admin as unknown as { from: (t: string) => { insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> } } } })
    .from(table).insert(values).select("id").single();
  if (error) throw error;
  return data!;
}

export async function seedEvalBrewery() {
  const brewery = await makeBrewery(`Eval Brewing ${crypto.randomUUID().slice(0, 8)}`);
  const breweryId = brewery.id;
  const [adminUser, sales, warehouse, brewer, taproom] = await Promise.all(
    (["admin", "sales", "warehouse", "brewer", "taproom"] as const).map(role => makeStaff(breweryId, role)));
  const put = (table: string, values: Record<string, unknown>) => row(table, { brewery_id: breweryId, ...values });

  const main = await seedLocation(breweryId, { name: "Warehouse" });
  const cold = await seedLocation(breweryId, { name: "Cold Store", uses: ["storage"] });
  await seedLocation(breweryId, { name: "Taproom", uses: ["taproom"] });

  const pils = await seedCatalog(breweryId, { product: "Pils", sku: "Pils 16 oz", format: "16 oz case" });
  const hazy = await seedCatalog(breweryId, { product: "Hazy IPA", sku: "Hazy IPA 16 oz", format: "16 oz case" });
  const stock = (skuId: string, location: { id: string; binId: string }, qty: number) => sql(`insert into public.inventory_movements
    (brewery_id, sku_id, location_id, bin_id, qty, bbl, type, created_by)
    values ('${breweryId}', '${skuId}', '${location.id}', '${location.binId}', ${qty}, ${qty * 0.0645}, 'opening_balance', '${adminUser.id}')`, true);
  stock(pils.skuId, main, 48);
  stock(hazy.skuId, main, 12);
  stock(pils.skuId, cold, 7);

  const ridgeline = await seedCustomer(breweryId, { name: "Ridgeline Tap Room" });
  const harbor = await seedCustomer(breweryId, { name: "Harbor Bottle Shop" });
  await seedCustomer(breweryId, { name: "Mill Street Pub" });
  for (const [customer, cents] of [[ridgeline, 184000], [harbor, 52500]] as const) {
    const invoice = await put("invoices", { customer_id: customer.customerId, kind: "invoice" });
    await put("invoice_lines", { invoice_id: invoice.id, sku_id: pils.skuId, description: "Pils 16 oz", qty: 1, unit_price_cents: cents });
  }

  const hops = await put("vendors", { name: "Yakima Valley Hops" });
  await put("vendors", { name: "Great Western Malting" });
  await put("vendors", { name: "Crown Cans" });
  const material = await put("materials", { name: "Citra", category: "hop", base_uom: "lb", purchase_uom: "lb" });
  const po = await put("purchase_orders", { vendor_id: hops.id, status: "sent", sent_via: "external", created_by: adminUser.id });
  await put("purchase_order_lines", { po_id: po.id, material_id: material.id, qty_ordered: 44 });
  sql(`update public.purchase_orders set po_no = 1042 where id = '${po.id}'`, true);

  await put("vessels", { name: "FV1", kind: "fermenter", capacity_bbl: 30 });
  const fv2 = await put("vessels", { name: "FV2", kind: "fermenter", capacity_bbl: 30 });
  await put("vessels", { name: "BBT1", kind: "brite", capacity_bbl: 20 });
  const batch = await put("batches", { planned_on: "2026-11-01", planned_bbl: 30, intended_brand_id: hazy.brandId, created_by: adminUser.id });
  const occupancy = await put("vessel_occupancies", { vessel_id: fv2.id, batch_id: batch.id, initial_bbl: 30 });
  await put("fermentation_readings", { batch_id: batch.id, occupancy_id: occupancy.id, gravity_plato: 3.2, created_by: brewer.id });

  return { breweryId, users: { admin: adminUser, sales, warehouse, brewer, taproom }, occupancyId: occupancy.id, mainId: main.id };
}
