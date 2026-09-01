// tests/rls-command-boundary.test.ts — live PostgREST proof that staff writes use only role-scoped RPCs.
// Every mutation RPC takes a p_request_id (request ledger); direct calls here mint a fresh one.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand, type Ctx } from "../lib/commands/registry";
import "../lib/commands/all";

type StaffCtx = Ctx;

let brewery: { id: string };
let adminCtx: StaffCtx;
let salesCtx: StaffCtx;
let warehouseCtx: StaffCtx;
let brewerCtx: StaffCtx;
let productId: string;
let skuId: string;
let locationId: string;
let taproomId: string;
let priceListId: string;
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
  productId = product.id;
  const { data: sku, error: skuError } = await admin.from("skus")
    .insert({ brewery_id: brewery.id, product_id: product.id, name: "Boundary case", package_type: "can", bbl_per_unit: 0.0645 })
    .select().single();
  if (skuError) throw skuError;
  skuId = sku.id;

  const { data: location, error: locationError } = await admin.from("locations")
    .insert({ brewery_id: brewery.id, name: "Boundary warehouse", kind: "warehouse" }).select().single();
  if (locationError) throw locationError;
  locationId = location.id;
  const { data: taproom, error: taproomError } = await admin.from("locations")
    .insert({ brewery_id: brewery.id, name: "Boundary taproom", kind: "taproom" }).select().single();
  if (taproomError) throw taproomError;
  taproomId = taproom.id;

  const { data: priceList, error: priceListError } = await admin.from("price_lists")
    .insert({ brewery_id: brewery.id, name: "Boundary wholesale" }).select().single();
  if (priceListError) throw priceListError;
  const { error: priceError } = await admin.from("price_list_items")
    .insert({ brewery_id: brewery.id, price_list_id: priceList.id, sku_id: skuId, unit_price_cents: 1200 });
  if (priceError) throw priceError;
  priceListId = priceList.id;
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
    const allowed = await salesCtx.db.rpc("create_product", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_name: "sales rpc product", p_style: null, p_abv: null,
    });
    const warehouse = await warehouseCtx.db.rpc("create_product", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_name: "warehouse rpc product", p_style: null, p_abv: null,
    });
    const brewer = await brewerCtx.db.rpc("create_product", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_name: "brewer rpc product", p_style: null, p_abv: null,
    });

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
      p_price_list: null, p_license_no: null, p_payment_terms: null,
    });
    const warehouseCustomer = await warehouseCtx.db.rpc("upsert_customer", { p_request_id: crypto.randomUUID(),
      p_id: null, p_brewery: brewery.id, p_name: "warehouse rpc customer", p_type: "retailer", p_state: "PA",
      p_price_list: null, p_license_no: null, p_payment_terms: null,
    });

    expect(location.error).toBeNull();
    expect(salesLocation.error?.code).toBe("42501");
    expect(customer.error).toBeNull();
    expect(warehouseCustomer.error?.code).toBe("42501");
  });

  it("keeps warehouse movement and sales order lifecycle RPCs role-bound", async () => {
    const movement = await warehouseCtx.db.rpc("record_inventory_movement", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_qty: 10,
      p_type: "opening_balance", p_channel: null, p_dest_state: null, p_note: null,
    });
    const salesMovement = await salesCtx.db.rpc("record_inventory_movement", { p_request_id: crypto.randomUUID(),
      p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_qty: 10,
      p_type: "opening_balance", p_channel: null, p_dest_state: null, p_note: null,
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
      command: "create_product", rpc: "create_product", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix product", role);
        return {
          command: { name },
          rpc: { p_brewery: brewery.id, p_name: name, p_style: null, p_abv: null },
        };
      },
    },
    {
      command: "create_sku", rpc: "create_sku", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix sku", role);
        return {
          command: { productId, name, packageType: "can", bblPerUnit: "0.0645" },
          rpc: {
            p_brewery: brewery.id, p_product: productId, p_name: name, p_package_type: "can",
            p_units_per_case: null, p_bbl_per_unit: "0.0645",
          },
        };
      },
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
      command: "upsert_customer", rpc: "upsert_customer", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix customer", role);
        return {
          command: { name, type: "retailer", state: "PA" },
          rpc: {
            p_id: null, p_brewery: brewery.id, p_name: name, p_type: "retailer", p_state: "PA",
            p_price_list: null, p_license_no: null, p_payment_terms: null,
          },
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
      command: "upsert_price_list", rpc: "upsert_price_list", allowed: ["admin", "sales"],
      input: async role => {
        const name = unique("matrix price list", role);
        return {
          command: { name },
          rpc: { p_id: null, p_brewery: brewery.id, p_name: name },
        };
      },
    },
    {
      command: "set_price", rpc: "set_price", allowed: ["admin", "sales"],
      input: async () => ({
        command: { priceListId: priceListId, skuId, unitPriceCents: 1300 },
        rpc: { p_brewery: brewery.id, p_price_list: priceListId, p_sku: skuId, p_unit_price_cents: 1300 },
      }),
    },
    {
      command: "record_movement", rpc: "record_inventory_movement", allowed: ["admin", "warehouse"],
      input: async () => ({
        command: { skuId, locationId, qty: 1, type: "opening_balance" },
        rpc: {
          p_brewery: brewery.id, p_sku: skuId, p_location: locationId, p_qty: 1,
          p_type: "opening_balance", p_channel: null, p_dest_state: null, p_note: null,
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
