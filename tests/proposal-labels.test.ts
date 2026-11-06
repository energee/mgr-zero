// tests/proposal-labels.test.ts — a person approves an agent's proposal on a card,
// so every id on the card must read as a name. The coverage test at the end is
// what scorecard row U6 in docs/plans/agent-access.md measures.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, channelId, ins, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, seedMaterial } from "./helpers";
import { listTools, runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { leafFields } from "@/lib/mgr/api-schema";
import { isIdField } from "@/lib/mgr/field-vocabulary";
import { idFieldKinds, labelProposal, LABEL_KINDS, readNames } from "@/lib/mgr/proposal-labels";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let adminCtx: Ctx;
let skuId: string, otherSkuId: string, foreignSkuId: string, brandId: string, customerId: string, shipToId: string, locationId: string, binId: string;
let orderId: string, orderLabel: string, orderLineId: string, poId: string, poLineId: string, materialLotId: string, lotId: string;

beforeAll(async () => {
  const brewery = await makeBrewery();
  const foreign = await makeBrewery();
  adminCtx = await makeStaffCtx(brewery.id, "admin");
  const location = await seedLocation(brewery.id, { name: "Main warehouse" });
  locationId = location.id;
  binId = location.binId;
  const catalog = await seedCatalog(brewery.id, { product: "Hazy IPA", sku: "Hazy IPA keg", packageType: "keg", bblPerUnit: 0.5 });
  skuId = catalog.skuId;
  brandId = catalog.brandId;
  otherSkuId = (await seedCatalog(brewery.id, { product: "Pale Ale", sku: "Pale Ale keg", packageType: "keg", bblPerUnit: 0.5 })).skuId;
  foreignSkuId = (await seedCatalog(foreign.id, { product: "Foreign", sku: "Foreign keg", packageType: "keg", bblPerUnit: 0.5 })).skuId;
  const customer = await seedCustomer(brewery.id, { name: "Ridgeline Tap Room" });
  customerId = customer.customerId;
  shipToId = customer.shipToId;
  await priceSku(brewery.id, { saleChannelId: await channelId(brewery.id, "Wholesale"), brandId, formatId: catalog.formatId, cents: 12000 });

  orderId = ((await runCommand("create_order", {
    kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId, qty: 1 }],
  }, adminCtx)) as { order_id: string }).order_id;
  const order = await admin.from("orders").select("order_no, order_lines(id)").eq("id", orderId).single();
  if (order.error) throw order.error;
  orderLabel = `ORD-${String(order.data.order_no).padStart(4, "0")}`;
  orderLineId = order.data.order_lines[0].id;

  const vendorId = (await ins("vendors", { brewery_id: brewery.id, name: "Maltsters Ltd" })).id;
  const materialId = await seedMaterial(brewery.id, { name: "Pilsner malt", category: "malt" });
  poId = ((await runCommand("create_purchase_order", { vendorId, lines: [{ materialId, qtyOrdered: 10 }] }, adminCtx)) as { id: string }).id;
  const po = await admin.from("purchase_order_lines").select("id").eq("po_id", poId).single();
  if (po.error) throw po.error;
  poLineId = po.data.id;

  materialLotId = (await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "MALT-77", received_on: "2026-10-01" })).id;
  const run = await ins("packaging_runs", { brewery_id: brewery.id, brand_id: brandId, planned_on: "2026-09-01", created_by: adminCtx.userId });
  lotId = (await ins("lots", { brewery_id: brewery.id, packaging_run_id: run.id, brand_id: brandId, code: "L-260901-HZ", packaged_on: "2026-09-01" })).id;
});

afterEach(() => vi.restoreAllMocks());

const row = async (command: string, input: unknown, field: string) =>
  (await labelProposal(adminCtx, command, input)).find(r => r.field === field);

describe("labelProposal", () => {
  it("shows a real id as its name, with the field's meaning", async () => {
    expect(await row("record_pick", { orderId, picks: [{ lineId: orderLineId, qty: 1 }] }, "orderId")).toEqual({
      field: "orderId", meaning: expect.stringContaining("order"), value: `${orderLabel} · Ridgeline Tap Room`,
    });
    expect(await row("create_order", { kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId, qty: 1 }] }, "lines[0].skuId"))
      .toMatchObject({ value: "Hazy IPA keg" });
  });

  it("shows another brewery's id as an unrecognised record, and keeps the id visible", async () => {
    const rows = await labelProposal(adminCtx, "create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId: foreignSkuId, qty: 1 }],
    });
    expect(rows.find(r => r.field === "lines[0].skuId")).toMatchObject({ value: `Unrecognised record ${foreignSkuId}`, warning: true });
    expect(rows.find(r => r.field === "customerId")).toMatchObject({ value: "Ridgeline Tap Room" });
  });

  it("says which order or purchase order a nested line is on", async () => {
    const ship = await row("ship_order", {
      orderId, ship: [{ lineId: orderLineId, qty: 1, sources: [{ binId, lotId, qty: 1 }] }], invoiceTiming: "now",
    }, "ship[0].lineId");
    expect(ship?.value).toBe(`Hazy IPA keg on ${orderLabel} · Ridgeline Tap Room`);
    const receive = await row("receive_purchase_order", {
      poId, locationId, binId, lines: [{ poLineId, qtyCounted: 10 }],
    }, "lines[0].poLineId");
    expect(receive?.value).toMatch(/^Pilsner malt on PO-\d{4} · Maltsters Ltd$/);
  });

  it("reaches an id two arrays deep", async () => {
    expect(await row("ship_order", {
      orderId, ship: [{ lineId: orderLineId, qty: 1, sources: [{ binId, lotId, qty: 1 }] }], invoiceTiming: "now",
    }, "ship[0].sources[0].lotId")).toMatchObject({ value: "L-260901-HZ" });
  });

  it("resolves the generic id and the ambiguous lotId by command", async () => {
    expect(await row("upsert_brand", { id: brandId, name: "Renamed" }, "id")).toMatchObject({ value: "Hazy IPA" });
    expect(await row("record_batch_addition", { lotId: materialLotId }, "lotId")).toMatchObject({ value: "MALT-77" });
    expect(await row("record_movement", { lotId }, "lotId")).toMatchObject({ value: "L-260901-HZ" });
  });

  it("tries each kind when a field can hold either: receive_stock_transfer takes a lot of either type", async () => {
    const rows = await labelProposal(adminCtx, "receive_stock_transfer", {
      transferId: orderId,
      lines: [{ lineId: orderId, qty: 1, sources: [{ lotId, qty: 1 }, { lotId: materialLotId, qty: 1 }] }],
    });
    expect(rows.find(r => r.field === "lines[0].sources[0].lotId")).toMatchObject({ value: "L-260901-HZ" });
    expect(rows.find(r => r.field === "lines[0].sources[1].lotId")).toMatchObject({ value: "MALT-77" });
  });

  it("leaves values that are not ids alone, with the vocabulary's unit", async () => {
    const rows = await labelProposal(adminCtx, "create_purchase_order", {
      vendorId: customerId, note: "Rush", lines: [{ materialId: customerId, qtyOrdered: 10, unitCostCents: 250 }],
    });
    expect(rows.find(r => r.field === "lines[0].unitCostCents")).toEqual({
      field: "lines[0].unitCostCents", meaning: expect.any(String), value: 250, unit: "cents",
    });
    expect(rows.find(r => r.field === "note")).toMatchObject({ value: "Rush" });
  });

  it("shows a null id as null and no row for a field the input left out", async () => {
    const rows = await labelProposal(adminCtx, "ship_order", {
      orderId, ship: [{ lineId: orderLineId, qty: 1, sources: [{ binId, lotId: null, qty: 1 }] }], invoiceTiming: "now",
    });
    const lot = rows.find(r => r.field === "ship[0].sources[0].lotId");
    expect(lot?.value).toBeNull();
    expect(lot?.warning).toBeUndefined();
    expect(rows.some(r => r.field === "carrier")).toBe(false);
  });

  it("flags an id with no way to look it up, and does not throw", async () => {
    expect(await row("set_qbo_item_mapping", { skuId, qboItemId: "42" }, "qboItemId")).toMatchObject({ value: "Unrecognised record 42", warning: true });
  });

  it("flags every id of a kind whose read fails, and does not throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await row("record_pick", { orderId: "not-a-uuid", picks: [] }, "orderId")).toMatchObject({ value: "Unrecognised record not-a-uuid", warning: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("refuses a command that is not registered, because it has no schema to walk", async () => {
    await expect(labelProposal(adminCtx, "no_such_command", {})).rejects.toThrow("unknown command no_such_command");
  });

  it("reads one kind in one query, however many ids it has", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await labelProposal(adminCtx, "create_order", {
      kind: "wholesale", customerId, shipToId, fromLocationId: locationId, lines: [{ skuId, qty: 1 }, { skuId: otherSkuId, qty: 1 }, { skuId: foreignSkuId, qty: 1 }],
    });
    const reads = fetchSpy.mock.calls.map(([url]) => String(url)).filter(url => url.includes("/rest/v1/skus"));
    expect(reads).toHaveLength(1);
  });
});

describe("every command id field", () => {
  // Each read must be valid against the schema. A bad select would otherwise
  // pass unnoticed, because labelProposal turns a failed read into a warning.
  it.each(LABEL_KINDS)("%s has a read the database accepts", async kind => {
    await expect(readNames(adminCtx, kind, [crypto.randomUUID()], { customerId })).resolves.toBeInstanceOf(Map);
  });

  // These have a kind but no name MGR can read through ctx.db. They show as an
  // unrecognised record. A new id field that cannot resolve fails this test.
  const NO_NAME_TO_READ = [
    "portal_submit_quote.quoteId", // The quote sits in a private table with no read.
    "set_notification_destination.externalDestinationId", // Slack holds the channel's name.
    "set_qbo_deposit_mapping.qboItemId", // QuickBooks holds the item's name.
    "set_qbo_item_mapping.qboItemId",
    "set_qbo_one_way_fee_mapping.qboItemId",
    "set_qbo_purchase_account.qboAccountId", // QuickBooks holds the account's name.
    "set_qbo_vendor_mapping.qboVendorId", // QuickBooks holds the vendor's name.
    "snooze_notification.deliveryId", // notification_deliveries has no read for staff.
  ];

  it("resolves to a kind, or is on the reviewed list above", () => {
    const unresolved = listTools().filter(tool => tool.kind === "command").flatMap(command =>
      leafFields(command.inputSchema)
        .filter(field => isIdField(field.name) && idFieldKinds(command.name, field.name).length === 0)
        .map(field => `${command.name}.${field.name}`));
    expect([...new Set(unresolved)].sort()).toEqual(NO_NAME_TO_READ);
  });
});
