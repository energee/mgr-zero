// tests/rls-command-boundary.test.ts — live PostgREST proof that staff writes use only role-scoped RPCs.
// Every mutation RPC takes a p_request_id (request ledger); direct calls here mint a fresh one.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, seedCustomer, priceSku } from "./helpers";
import { runCommand, type Ctx } from "../lib/commands/registry";
import "../lib/commands/all";

type StaffCtx = Ctx;

let brewery: { id: string };
let adminCtx: StaffCtx;
let salesCtx: StaffCtx;
let warehouseCtx: StaffCtx;
let brewerCtx: StaffCtx;
let formatId: string;
let skuId: string;
let locationId: string;
let binId: string;
let taproomId: string;
let saleChannelId: string;
let customerId: string;
let shipToId: string;

beforeAll(async () => {
  brewery = await makeBrewery();
  adminCtx = await makeStaffCtx(brewery.id, "admin");
  salesCtx = await makeStaffCtx(brewery.id, "sales");
  warehouseCtx = await makeStaffCtx(brewery.id, "warehouse");
  brewerCtx = await makeStaffCtx(brewery.id, "brewer");

  const cat = await seedCatalog(brewery.id, { product: "Boundary IPA", sku: "Boundary case" });
  ({ formatId, skuId } = cat);
  ({ id: locationId, binId } = await seedLocation(brewery.id, { name: "Boundary warehouse" }));
  taproomId = (await seedLocation(brewery.id, { name: "Boundary taproom", kind: "taproom" })).id;
  ({ customerId, shipToId, saleChannelId } = await seedCustomer(brewery.id, { name: "Boundary customer" }));
  await priceSku(brewery.id, { saleChannelId, brandId: cat.brandId, formatId, cents: 1200 });
});

describe("staff command database boundary", () => {
  it("denies raw brand inserts to every staff role", async () => {
    const adminRaw = await adminCtx.db.from("brands")
      .insert({ brewery_id: brewery.id, name: "admin raw brand" });
    const salesRaw = await salesCtx.db.from("brands")
      .insert({ brewery_id: brewery.id, name: "sales raw brand" });
    const warehouseRaw = await warehouseCtx.db.from("brands")
      .insert({ brewery_id: brewery.id, name: "warehouse raw brand" });
    const brewerRaw = await brewerCtx.db.from("brands")
      .insert({ brewery_id: brewery.id, name: "brewer raw brand" });

    expect(adminRaw.error?.code).toBe("42501");
    expect(salesRaw.error?.code).toBe("42501");
    expect(warehouseRaw.error?.code).toBe("42501");
    expect(brewerRaw.error?.code).toBe("42501");
  });

  it("allows sales to create brands only through its RPC and rejects warehouse and brewer", async () => {
    const args = (name: string) => ({ p_request_id: crypto.randomUUID(), p_brewery: brewery.id, p_id: null, p_name: name,
      p_style: null, p_abv: null, p_description: null, p_category: null, p_price_group: null, p_hops: null });
    const allowed = await salesCtx.db.rpc("upsert_brand", args("sales rpc product"));
    const warehouse = await warehouseCtx.db.rpc("upsert_brand", args("warehouse rpc product"));
    const brewer = await brewerCtx.db.rpc("upsert_brand", args("brewer rpc product"));

    expect(allowed.error).toBeNull();
    expect(allowed.data).toMatchObject({ name: "sales rpc product", brewery_id: brewery.id });
    expect(warehouse.error?.code).toBe("42501");
    expect(brewer.error?.code).toBe("42501");
  });

  it("keeps admin-only location and sales/admin customer RPCs role-bound", async () => {
    const location = await adminCtx.db.rpc("create_location", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_name: "admin rpc location", p_kind: "taproom",
    });
    const salesLocation = await salesCtx.db.rpc("create_location", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_name: "sales rpc location", p_kind: "taproom",
    });
    const customer = await salesCtx.db.rpc("upsert_customer", { p_request_id: crypto.randomUUID(),
      p_id: null, p_brewery: brewery.id, p_name: "sales rpc customer", p_type: "retailer", p_state: "PA",
      p_sale_channel: saleChannelId, p_license_no: null, p_payment_terms: null, p_tax_treatment: null,
    });
    const warehouseCustomer = await warehouseCtx.db.rpc("upsert_customer", { p_request_id: crypto.randomUUID(),
      p_id: null, p_brewery: brewery.id, p_name: "warehouse rpc customer", p_type: "retailer", p_state: "PA",
      p_sale_channel: saleChannelId, p_license_no: null, p_payment_terms: null, p_tax_treatment: null,
    });

    expect(location.error).toBeNull();
    expect(salesLocation.error?.code).toBe("42501");
    expect(customer.error).toBeNull();
    expect(warehouseCustomer.error?.code).toBe("42501");
  });

  it("keeps warehouse movement and sales order lifecycle RPCs role-bound", async () => {
    const movement = await warehouseCtx.db.rpc("record_inventory_movement", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_bin: binId, p_qty: 10,
      p_type: "opening_balance", p_sale_channel: null, p_dest_state: null, p_note: null,
    });
    const salesMovement = await salesCtx.db.rpc("record_inventory_movement", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_bin: binId, p_qty: 10,
      p_type: "opening_balance", p_sale_channel: null, p_dest_state: null, p_note: null,
    });
    const order = await salesCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
      p_from_location: locationId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }],
    });
    const warehouseOrder = await warehouseCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
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

type StaffRole = "admin" | "sales" | "warehouse" | "brewer";
type MatrixInput = { command: Record<string, unknown>; rpc: Record<string, unknown> };
type MatrixCase = {
  command: string;
  rpc: string;
  allowed: StaffRole[];
  input: (role: StaffRole) => Promise<MatrixInput>;
};

const staffRoles: StaffRole[] = ["admin", "sales", "warehouse", "brewer"];
const contexts = (): Record<StaffRole, StaffCtx> => ({
  admin: adminCtx,
  sales: salesCtx,
  warehouse: warehouseCtx,
  brewer: brewerCtx,
});
const unique = (label: string, role: StaffRole) => `${label} ${role} ${crypto.randomUUID().slice(0, 8)}`;
// price_groups is unique on (brewery, position); the seed helper takes 1.
let position = 1;
const nextPosition = () => ++position;

async function draftOrder() {
  const order = await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId, qty: 1 }],
  }, adminCtx) as { order_id: string };
  return order.order_id;
}

async function orderLine(orderId: string) {
  const { data, error } = await admin.from("order_lines").select("id").eq("order_id", orderId).single();
  if (error) throw error;
  return data.id;
}

async function submittedOrder() {
  const orderId = await draftOrder();
  await runCommand("submit_order", { orderId }, adminCtx);
  return orderId;
}

async function confirmedOrder() {
  const orderId = await submittedOrder();
  await runCommand("confirm_order", { orderId }, adminCtx);
  return orderId;
}

async function pickedOrder() {
  const orderId = await confirmedOrder();
  const lineId = await orderLine(orderId);
  await runCommand("record_pick", { orderId, picks: [{ lineId, qty: 1 }] }, adminCtx);
  return { orderId, lineId };
}

async function invoicedOrder() {
  const { orderId, lineId } = await pickedOrder();
  const shipped = await runCommand("ship_order", {
    orderId, ship: [{ lineId, qty: 1 }],
  }, adminCtx) as { invoice_id: string };
  const { data, error } = await admin.from("invoice_lines").select("id").eq("invoice_id", shipped.invoice_id).single();
  if (error) throw error;
  return { invoiceId: shipped.invoice_id, invoiceLineId: data.id };
}

describe("tenant-safe document counters", () => {
  it("no authenticated user can call next_no directly, for their own or another brewery", async () => {
    const other = await makeBrewery();
    for (const ctx of [adminCtx, salesCtx, warehouseCtx, brewerCtx]) {
      for (const b of [brewery.id, other.id]) {
        // next_no lives in `private`, outside the Data API: PostgREST cannot resolve it at all.
        const { error } = await ctx.db.rpc("next_no", { b, k: "order" });
        expect(error?.code, `${ctx.role} next_no(${b === other.id ? "other" : "own"})`).toMatch(/^(42501|PGRST202)$/);
      }
    }
    const { data: counters } = await admin.from("brewery_counters").select("key").eq("brewery_id", other.id);
    expect(counters).toEqual([]);
  });

  it("orders created through the authorized lifecycle RPC still number from the owning brewery's counter only", async () => {
    const other = await makeBrewery();
    const { data: before } = await admin.from("brewery_counters").select("next").eq("brewery_id", brewery.id).eq("key", "order").maybeSingle();
    const { data, error } = await salesCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
      p_from_location: locationId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
      p_lines: [{ sku_id: skuId, qty: 1 }],
    });
    expect(error).toBeNull();
    const { data: order } = await admin.from("orders").select("order_no").eq("id", data.order_id).single();
    expect(order!.order_no).toBe((before?.next ?? 1));
    const { data: foreign } = await admin.from("brewery_counters").select("key").eq("brewery_id", other.id);
    expect(foreign).toEqual([]);
  });
});

describe("registered staff mutation role × RPC matrix", () => {
  const matrix: MatrixCase[] = [
    {
      command: "upsert_brand", rpc: "upsert_brand", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix brand", role);
        return {
          command: { name, style: "Lager" },
          rpc: { p_brewery: brewery.id, p_id: null, p_name: name, p_style: "Lager", p_abv: null, p_description: null, p_category: null, p_price_group: null, p_hops: null },
        };
      },
    },
    {
      command: "create_sku", rpc: "create_sku", allowed: ["admin", "sales"],
      input: async role => {
        const { data: b } = await admin.from("brands").insert({ brewery_id: brewery.id, name: unique("matrix sku brand", role) }).select("id").single();
        return {
          command: { brandId: b!.id, formatId },
          rpc: { p_brewery: brewery.id, p_brand: b!.id, p_format: formatId, p_name: null, p_upc: null },
        };
      },
    },
    {
      command: "upsert_format", rpc: "upsert_format", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix format", role);
        return {
          command: { name, basis: "packaged", packageType: "can", bblPerUnit: 0.0645 },
          rpc: { p_brewery: brewery.id, p_id: null, p_name: name, p_basis: "packaged", p_package_type: "can", p_keg_size: null, p_units_per_case: null, p_bbl_per_unit: 0.0645 },
        };
      },
    },
    {
      command: "replace_format_components", rpc: "replace_format_components", allowed: ["admin", "sales"],
      input: async role => {
        const { data: parent } = await admin.from("formats").insert({ brewery_id: brewery.id, name: unique("matrix case", role), basis: "packaged", package_type: "can" }).select("id").single();
        return {
          command: { formatId: parent!.id, components: [{ childFormatId: formatId, qty: 6 }] },
          rpc: { p_brewery: brewery.id, p_format: parent!.id, p_components: [{ child_format_id: formatId, qty: 6 }] },
        };
      },
    },
    {
      command: "replace_format_bom", rpc: "replace_format_bom", allowed: ["admin", "sales"],
      input: async () => ({ command: { formatId, lines: [] }, rpc: { p_brewery: brewery.id, p_format: formatId, p_lines: [] } }),
    },
    {
      command: "create_location", rpc: "create_location", allowed: ["admin"],
      input: async role => {
        const name = unique("matrix location", role);
        return {
          command: { name, kind: "taproom" },
          rpc: { p_brewery: brewery.id, p_name: name, p_kind: "taproom" },
        };
      },
    },
    {
      command: "create_stock_transfer", rpc: "create_stock_transfer", allowed: ["admin", "warehouse"],
      input: async () => {
        const to = await seedLocation(brewery.id, { name: unique("matrix storage", "admin"), kind: "storage" });
        return {
          command: { fromLocationId: locationId, toLocationId: to.id, lines: [{ skuId, qty: 1, fromBinId: binId, toBinId: to.binId }] },
          rpc: { p_brewery: brewery.id, p_from: locationId, p_to: to.id, p_requested: null, p_note: null,
                 p_lines: [{ sku_id: skuId, qty: 1, from_bin_id: binId, to_bin_id: to.binId }] },
        };
      },
    },
    {
      command: "receive_stock_transfer", rpc: "receive_stock_transfer", allowed: ["admin", "warehouse"],
      input: async () => {
        const to = await seedLocation(brewery.id, { name: unique("matrix receive", "admin"), kind: "storage" });
        const db = contexts().admin.db;
        const { data } = await db.rpc("create_stock_transfer", { p_brewery: brewery.id, p_from: locationId, p_to: to.id, p_requested: null, p_note: null,
          p_lines: [{ sku_id: skuId, qty: 1, from_bin_id: binId, to_bin_id: to.binId }], p_request_id: crypto.randomUUID() });
        const transferId = (data as { transfer_id: string }).transfer_id;
        await db.rpc("submit_stock_transfer", { p_transfer: transferId, p_request_id: crypto.randomUUID() });
        const { data: line } = await admin.from("stock_transfer_lines").select("id").eq("transfer_id", transferId).single();
        await db.rpc("record_stock_transfer_pick", { p_transfer: transferId, p_picks: [{ line_id: line!.id, qty: 1 }], p_request_id: crypto.randomUUID() });
        return { command: { transferId, lines: [{ lineId: line!.id, qty: 1 }] }, rpc: { p_transfer: transferId, p_lines: [{ line_id: line!.id, qty: 1 }] } };
      },
    },
    {
      command: "move_stock_bin", rpc: "move_stock_bin", allowed: ["admin", "warehouse"],
      input: async () => {
        const { data: bins } = await admin.from("bins").select("id").eq("location_id", locationId).order("name");
        await contexts().admin.db.rpc("record_inventory_movement", { p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_bin: bins![0].id, p_qty: 5, p_type: "opening_balance", p_sale_channel: null, p_dest_state: null, p_note: null, p_request_id: crypto.randomUUID() });
        return {
          command: { skuId, qty: 1, fromBinId: bins![0].id, toBinId: bins![1].id },
          rpc: { p_brewery: brewery.id, p_sku: skuId, p_material: null, p_keg_pool: null, p_keg_size: null, p_qty: 1, p_from_bin: bins![0].id, p_to_bin: bins![1].id, p_note: null },
        };
      },
    },
    {
      command: "create_bin", rpc: "create_bin", allowed: ["admin", "warehouse"],
      input: async role => {
        const name = unique("matrix bin", role);
        return {
          command: { locationId, name },
          rpc: { p_brewery: brewery.id, p_location: locationId, p_name: name },
        };
      },
    },
    {
      command: "upsert_customer", rpc: "upsert_customer", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix customer", role);
        return {
          command: { name, type: "retailer", state: "PA", saleChannelId },
          rpc: {
            p_id: null, p_brewery: brewery.id, p_name: name, p_type: "retailer", p_state: "PA",
            p_sale_channel: saleChannelId, p_license_no: null, p_payment_terms: null, p_tax_treatment: null,
          },
        };
      },
    },
    {
      command: "upsert_price_group", rpc: "upsert_price_group", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix group", role);
        const position = nextPosition();
        return {
          command: { name, position },
          rpc: { p_brewery: brewery.id, p_id: null, p_name: name, p_position: position, p_cost_ceiling_cents: null },
        };
      },
    },
    {
      command: "delete_price_group", rpc: "delete_price_group", allowed: ["admin", "sales"],
      input: async role => {
        const { data } = await admin.from("price_groups")
          .insert({ brewery_id: brewery.id, name: unique("matrix drop group", role), position: nextPosition() }).select("id").single();
        return { command: { priceGroupId: data!.id }, rpc: { p_brewery: brewery.id, p_id: data!.id } };
      },
    },
    {
      command: "set_channel_price", rpc: "set_channel_price", allowed: ["admin", "sales"],
      input: async role => {
        const { data } = await admin.from("price_groups")
          .insert({ brewery_id: brewery.id, name: unique("matrix cell group", role), position: nextPosition() }).select("id").single();
        return {
          command: { saleChannelId, priceGroupId: data!.id, formatId, unitPriceCents: 1500 },
          rpc: { p_brewery: brewery.id, p_sale_channel: saleChannelId, p_price_group: data!.id, p_format: formatId, p_unit_price_cents: 1500 },
        };
      },
    },
    {
      command: "clear_channel_price", rpc: "clear_channel_price", allowed: ["admin", "sales"],
      input: async role => {
        const { data } = await admin.from("price_groups")
          .insert({ brewery_id: brewery.id, name: unique("matrix clear group", role), position: nextPosition() }).select("id").single();
        await admin.from("channel_prices").insert({ brewery_id: brewery.id, sale_channel_id: saleChannelId, price_group_id: data!.id, format_id: formatId, unit_price_cents: 1500 });
        return {
          command: { saleChannelId, priceGroupId: data!.id, formatId },
          rpc: { p_brewery: brewery.id, p_sale_channel: saleChannelId, p_price_group: data!.id, p_format: formatId },
        };
      },
    },
    {
      command: "upsert_sale_channel", rpc: "upsert_sale_channel", allowed: ["admin"],
      input: async role => {
        const name = unique("matrix channel", role);
        return {
          command: { name, taxTreatment: "taxable" },
          rpc: { p_brewery: brewery.id, p_id: null, p_name: name, p_tax_treatment: "taxable" },
        };
      },
    },
    {
      command: "delete_sale_channel", rpc: "delete_sale_channel", allowed: ["admin"],
      input: async role => {
        const name = unique("matrix drop channel", role);
        const { data } = await admin.from("sale_channels").insert({ brewery_id: brewery.id, name }).select("id").single();
        return {
          command: { channelId: data!.id },
          rpc: { p_brewery: brewery.id, p_id: data!.id },
        };
      },
    },
    {
      command: "upsert_ship_to", rpc: "upsert_ship_to", allowed: ["admin", "sales"],
      input: async role => {
        const label = unique("matrix ship-to", role);
        return {
          command: { customerId, label, address1: "1 Matrix Way", city: "Phila", state: "PA", zip: "19107" },
          rpc: {
            p_id: null, p_brewery: brewery.id, p_customer: customerId, p_label: label,
            p_address1: "1 Matrix Way", p_address2: null, p_city: "Phila", p_state: "PA", p_zip: "19107",
          },
        };
      },
    },
    {
      command: "record_movement", rpc: "record_inventory_movement", allowed: ["admin", "warehouse"],
      input: async () => ({
        command: { skuId, locationId, binId, qty: 1, type: "opening_balance" },
        rpc: {
          p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_bin: binId, p_qty: 1,
          p_type: "opening_balance", p_sale_channel: null, p_dest_state: null, p_note: null,
        },
      }),
    },
    {
      command: "set_taproom_par", rpc: "set_taproom_par", allowed: ["admin", "sales"],
      input: async () => ({
        command: { locationId, skuId, parQty: 3 },
        rpc: { p_brewery: brewery.id, p_location: locationId, p_sku: skuId, p_par_qty: 3 },
      }),
    },
    {
      command: "set_standing_allocation", rpc: "set_standing_allocation", allowed: ["admin", "sales"],
      input: async () => ({
        command: { locationId, skuId, qty: 2 },
        rpc: { p_location: locationId, p_sku: skuId, p_qty: 2 },
      }),
    },
    {
      command: "create_order", rpc: "create_order", allowed: ["admin", "sales"],
      input: async () => ({
        command: { kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId, qty: 1 }] },
        rpc: {
          p_brewery: brewery.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
          p_from_location: locationId, p_to_location: null, p_requested: null, p_po: null, p_note: null,
          p_lines: [{ sku_id: skuId, qty: 1 }],
        },
      }),
    },
    {
      command: "update_draft_order", rpc: "update_draft_order", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await draftOrder();
        return {
          command: { orderId, lines: [{ skuId, qty: 1 }] },
          rpc: { p_order: orderId, p_ship_to: null, p_requested: null, p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 1 }] },
        };
      },
    },
    {
      command: "submit_order", rpc: "submit_order", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await draftOrder();
        return { command: { orderId }, rpc: { p_order: orderId } };
      },
    },
    {
      command: "confirm_order", rpc: "confirm_order", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await submittedOrder();
        return { command: { orderId }, rpc: { p_order: orderId } };
      },
    },
    {
      command: "adjust_order_lines", rpc: "adjust_order_lines", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await confirmedOrder();
        return {
          command: { orderId, reason: "matrix adjustment", lines: [{ skuId, qty: 1 }] },
          rpc: { p_order: orderId, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "matrix adjustment" },
        };
      },
    },
    {
      command: "cancel_order", rpc: "cancel_order", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await draftOrder();
        return {
          command: { orderId, reason: "matrix cancellation" },
          rpc: { p_order: orderId, p_reason: "matrix cancellation" },
        };
      },
    },
    {
      command: "record_pick", rpc: "record_pick", allowed: ["admin", "warehouse"],
      input: async () => {
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        return {
          command: { orderId, picks: [{ lineId, qty: 1 }] },
          rpc: { p_order: orderId, p_picks: [{ line_id: lineId, qty_picked: 1 }] },
        };
      },
    },
    {
      command: "confirm_restock", rpc: "confirm_restock", allowed: ["admin", "warehouse"],
      input: async () => {
        // adjust-after-pick is what sets needs_restock
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        const db = contexts().admin.db;
        await db.rpc("record_pick", { p_order: orderId, p_picks: [{ line_id: lineId, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
        await db.rpc("adjust_order_lines", { p_order: orderId, p_lines: [{ sku_id: skuId, qty: 1 }], p_reason: "cut", p_request_id: crypto.randomUUID() });
        return { command: { orderId }, rpc: { p_order: orderId } };
      },
    },
    {
      command: "resolve_short_pick", rpc: "resolve_short_pick", allowed: ["admin", "warehouse"],
      input: async () => {
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        return {
          command: { orderId, lineId, qtyPicked: 0, reason: "short", resolution: "keep_owed" },
          rpc: { p_order: orderId, p_line: lineId, p_qty_picked: 0, p_reason: "short", p_resolution: "keep_owed" },
        };
      },
    },
    {
      command: "confirm_delivery", rpc: "confirm_delivery", allowed: ["admin", "warehouse"],
      input: async () => {
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        const db = contexts().admin.db;
        await db.rpc("record_pick", { p_order: orderId, p_picks: [{ line_id: lineId, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
        await db.rpc("ship_order", { p_order: orderId, p_ship: [{ line_id: lineId, qty_shipped: 1 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
        const { data: sh } = await admin.from("shipments").select("id").eq("order_id", orderId).single();
        const { data: route } = await admin.from("routes").insert({ brewery_id: brewery.id, delivery_date: "2026-09-08", name: "matrix" }).select("id").single();
        const { data: del } = await admin.from("deliveries").insert({ brewery_id: brewery.id, route_id: route!.id, shipment_id: sh!.id, stop_no: 1 }).select("id").single();
        return { command: { deliveryId: del!.id, signedBy: "Dana" }, rpc: { p_delivery: del!.id, p_signed_by: "Dana" } };
      },
    },
    {
      command: "release_allocation", rpc: "release_allocation", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        const { data: alloc } = await admin.from("allocations").select("id").eq("ref", lineId).eq("status", "open").single();
        return { command: { allocationId: alloc!.id }, rpc: { p_allocation: alloc!.id } };
      },
    },
    {
      command: "return_shipment", rpc: "return_shipment", allowed: ["admin", "sales"],
      input: async () => {
        const orderId = await confirmedOrder();
        const lineId = await orderLine(orderId);
        const db = contexts().admin.db;
        await db.rpc("record_pick", { p_order: orderId, p_picks: [{ line_id: lineId, qty_picked: 1 }], p_request_id: crypto.randomUUID() });
        const { data } = await db.rpc("ship_order", { p_order: orderId, p_ship: [{ line_id: lineId, qty_shipped: 1 }], p_carrier: null, p_tracking: null, p_request_id: crypto.randomUUID() });
        const invoiceId = (data as { invoice_id: string }).invoice_id;
        const { data: il } = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).single();
        return {
          command: { invoiceId, locationId, reason: "unsold", lines: [{ invoiceLineId: il!.id, qty: 1 }] },
          rpc: { p_invoice: invoiceId, p_location: locationId, p_reason: "unsold", p_lines: [{ invoice_line_id: il!.id, qty: 1 }] },
        };
      },
    },
    {
      command: "ship_order", rpc: "ship_order", allowed: ["admin", "warehouse"],
      input: async () => {
        const { orderId, lineId } = await pickedOrder();
        return {
          command: { orderId, ship: [{ lineId, qty: 1 }] },
          rpc: { p_order: orderId, p_ship: [{ line_id: lineId, qty_shipped: 1 }], p_carrier: null, p_tracking: null },
        };
      },
    },
    {
      command: "create_credit_memo", rpc: "create_credit_memo", allowed: ["admin", "sales"],
      input: async () => {
        const { invoiceId, invoiceLineId } = await invoicedOrder();
        return {
          command: { invoiceId, locationId, reason: "matrix credit", lines: [{ invoiceLineId, qty: 1 }] },
          rpc: {
            p_invoice: invoiceId, p_lines: [{ invoice_line_id: invoiceLineId, qty: 1 }],
            p_location: locationId, p_reason: "matrix credit",
          },
        };
      },
    },
    {
      command: "create_replenishment_order", rpc: "create_replenishment_order", allowed: ["admin", "sales"],
      input: async () => ({
        command: { fromLocationId: locationId, toLocationId: taproomId, lines: [{ skuId, qty: 1 }] },
        rpc: { p_from: locationId, p_to: taproomId, p_lines: [{ sku_id: skuId, qty: 1 }] },
      }),
    },
  ];

  for (const entry of matrix) {
    it(`${entry.command} allows only its registered staff roles through the command registry`, async () => {
      for (const role of entry.allowed) {
        const input = await entry.input(role);
        await expect(runCommand(entry.command, input.command, contexts()[role]), `${entry.command} allows ${role}`)
          .resolves.toBeTruthy();
      }
      for (const role of staffRoles.filter(role => !entry.allowed.includes(role))) {
        const input = await entry.input(role);
        const { error } = await contexts()[role].db.rpc(entry.rpc, { ...input.rpc, p_request_id: crypto.randomUUID() });
        expect(error?.code, `${entry.command} RPC rejects ${role}`).toBe("42501");
      }
    });
  }
});
