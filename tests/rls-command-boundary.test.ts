// tests/rls-command-boundary.test.ts — live PostgREST proof that staff writes use only role-scoped RPCs.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import type { Ctx } from "../lib/commands/registry";

type StaffCtx = Ctx;

let brewery: { id: string };
let adminCtx: StaffCtx;
let salesCtx: StaffCtx;
let warehouseCtx: StaffCtx;
let brewerCtx: StaffCtx;
let skuId: string;
let locationId: string;
let customerId: string;
let shipToId: string;

beforeAll(async () => {
  brewery = await makeBrewery();
  adminCtx = await makeStaffCtx(brewery.id, "admin");
  salesCtx = await makeStaffCtx(brewery.id, "sales");
  warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
  brewerCtx = await makeStaffCtx(brewery.id, "brewer");

  const { data: product, error: productError } = await admin.from("products")
    .insert({ brewery_id: brewery.id, name: "Boundary IPA" }).select().single();
  if (productError) throw productError;
  const { data: sku, error: skuError } = await admin.from("skus")
    .insert({ brewery_id: brewery.id, product_id: product.id, name: "Boundary case", package_type: "can", bbl_per_unit: 0.0645 })
    .select().single();
  if (skuError) throw skuError;
  skuId = sku.id;

  const { data: location, error: locationError } = await admin.from("locations")
    .insert({ brewery_id: brewery.id, name: "Boundary warehouse", kind: "warehouse" }).select().single();
  if (locationError) throw locationError;
  locationId = location.id;

  const { data: priceList, error: priceListError } = await admin.from("price_lists")
    .insert({ brewery_id: brewery.id, name: "Boundary wholesale" }).select().single();
  if (priceListError) throw priceListError;
  const { error: priceError } = await admin.from("price_list_items")
    .insert({ brewery_id: brewery.id, price_list_id: priceList.id, sku_id: skuId, unit_price_cents: 1200 });
  if (priceError) throw priceError;
  const { data: customer, error: customerError } = await admin.from("customers")
    .insert({ brewery_id: brewery.id, name: "Boundary customer", type: "retailer", state: "PA", price_list_id: priceList.id })
    .select().single();
  if (customerError) throw customerError;
  customerId = customer.id;
  const { data: shipTo, error: shipToError } = await admin.from("ship_tos")
    .insert({ brewery_id: brewery.id, customer_id: customerId, label: "Boundary", address1: "1 Boundary Way", city: "Phila", state: "PA", zip: "19107" })
    .select().single();
  if (shipToError) throw shipToError;
  shipToId = shipTo.id;
});

describe("staff command database boundary", () => {
  it("denies raw product inserts to every staff role", async () => {
    const adminRaw = await adminCtx.db.from("products")
      .insert({ brewery_id: brewery.id, name: "admin raw product" });
    const salesRaw = await salesCtx.db.from("products")
      .insert({ brewery_id: brewery.id, name: "sales raw product" });
    const warehouseRaw = await warehouseCtx.db.from("products")
      .insert({ brewery_id: brewery.id, name: "warehouse raw product" });
    const brewerRaw = await brewerCtx.db.from("products")
      .insert({ brewery_id: brewery.id, name: "brewer raw product" });

    expect(adminRaw.error?.code).toBe("42501");
    expect(salesRaw.error?.code).toBe("42501");
    expect(warehouseRaw.error?.code).toBe("42501");
    expect(brewerRaw.error?.code).toBe("42501");
  });

  it("allows sales to create products only through its RPC and rejects warehouse and brewer", async () => {
    const allowed = await salesCtx.db.rpc("create_product", {
      p_brewery: brewery.id, p_name: "sales rpc product", p_style: null, p_abv: null,
    });
    const warehouse = await warehouseCtx.db.rpc("create_product", {
      p_brewery: brewery.id, p_name: "warehouse rpc product", p_style: null, p_abv: null,
    });
    const brewer = await brewerCtx.db.rpc("create_product", {
      p_brewery: brewery.id, p_name: "brewer rpc product", p_style: null, p_abv: null,
    });

    expect(allowed.error).toBeNull();
    expect(allowed.data).toMatchObject({ name: "sales rpc product", brewery_id: brewery.id });
    expect(warehouse.error?.code).toBe("42501");
    expect(brewer.error?.code).toBe("42501");
  });

  it("keeps admin-only location and sales/admin customer RPCs role-bound", async () => {
    const location = await adminCtx.db.rpc("create_location", {
      p_brewery: brewery.id, p_name: "admin rpc location", p_kind: "taproom",
    });
    const salesLocation = await salesCtx.db.rpc("create_location", {
      p_brewery: brewery.id, p_name: "sales rpc location", p_kind: "taproom",
    });
    const customer = await salesCtx.db.rpc("upsert_customer", {
      p_id: null, p_brewery: brewery.id, p_name: "sales rpc customer", p_type: "retailer", p_state: "PA",
      p_price_list: null, p_license_no: null, p_payment_terms: null,
    });
    const warehouseCustomer = await warehouseCtx.db.rpc("upsert_customer", {
      p_id: null, p_brewery: brewery.id, p_name: "warehouse rpc customer", p_type: "retailer", p_state: "PA",
      p_price_list: null, p_license_no: null, p_payment_terms: null,
    });

    expect(location.error).toBeNull();
    expect(salesLocation.error?.code).toBe("42501");
    expect(customer.error).toBeNull();
    expect(warehouseCustomer.error?.code).toBe("42501");
  });

  it("keeps warehouse movement and sales order lifecycle RPCs role-bound", async () => {
    const movement = await warehouseCtx.db.rpc("record_movement", {
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_qty: 10,
      p_type: "opening_balance", p_channel: null, p_dest_state: null, p_note: null,
    });
    const salesMovement = await salesCtx.db.rpc("record_movement", {
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_qty: 10,
      p_type: "opening_balance", p_channel: null, p_dest_state: null, p_note: null,
    });
    const order = await salesCtx.db.rpc("create_order", {
      p_brewery: brewery.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
      p_from_location: locationId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }],
    });
    const warehouseOrder = await warehouseCtx.db.rpc("create_order", {
      p_brewery: brewery.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
      p_from_location: locationId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }],
    });

    expect(movement.error).toBeNull();
    expect(salesMovement.error?.code).toBe("42501");
    expect(order.error).toBeNull();
    expect(warehouseOrder.error?.code).toBe("42501");
  });
});
