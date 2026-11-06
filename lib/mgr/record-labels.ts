// lib/mgr/record-labels.ts — how to read a record's readable name, for each kind
// of record: its table, the columns to select, and the name those columns make.
// search_entities filters these selects by what a person typed.
// lib/mgr/proposal-labels.ts filters them by id, to show ids as names.
// A line's name says which document it is on, because a line alone means nothing.
import { formatDate } from "@/lib/date-format";
import { batNo, docNo, poNo, runNo, trfNo } from "@/lib/mgr/doc-no";
import { sentenceCase } from "@/lib/mgr/labels";
import { money } from "@/lib/mgr/money";

export type Row = Record<string, unknown>;

/** `key` is the column that holds the id; it defaults to `id`. */
export type RecordLabel = { table: string; select: string; key?: string; label: (row: Row) => string };

const name = (embed: unknown) => (embed as { name: string } | null)?.name ?? "";
const named = (row: Row) => row.name as string;
const date = (value: unknown) => formatDate(value as string);

// A parent document's columns and name, shared by its own kind and by the rows on it.
const ORDER = "order_no, customers(name)";
const orderName = (row: Row) => `${docNo("ORD", row.order_no as number, "Order")} · ${(row.customers as { name: string } | null)?.name ?? "transfer"}`;
const INVOICE = "invoice_no, customers(name)";
const invoiceName = (row: Row) => `${docNo("INV", row.invoice_no as number, "Invoice")} · ${name(row.customers)}`;
const PO = "po_no, vendors(name)";
const poName = (row: Row) => `${poNo(row.po_no as number)} · ${name(row.vendors)}`;
const BATCH = "batch_no, brands!batches_intended_brand_id_brewery_id_fkey(name)";
const batchName = (row: Row) => `${batNo(row.batch_no as number)} · ${name(row.brands)}`;
const RUN = "run_no, brands(name)";
const runName = (row: Row) => `${runNo(row.run_no as number)} · ${name(row.brands)}`;
const TRANSFER = "transfer_no, from_location:locations!stock_transfers_from_location_id_brewery_id_fkey(name), to_location:locations!stock_transfers_to_location_id_brewery_id_fkey(name)";
const transferName = (row: Row) => `${trfNo(row.transfer_no as number)} · ${name(row.from_location)} → ${name(row.to_location)}`;
const recipeVersionName = (row: Row) => `${name(row.recipes)} v${row.version}`;
const countName = (row: Row) => `count at ${name(row.locations)} on ${date(row.counted_on)}`;

export const RECORD_LABELS = {
  // The kinds search_entities searches. It also reads the columns its result detail shows.
  sku: { table: "skus", select: "id, name, brands(name)", label: named },
  customer: { table: "customers", select: "id, name, country, state", label: named },
  material_lot: { table: "material_lots", select: "id,lot_code,materials(name)", label: row => row.lot_code as string },
  lot: { table: "lots", select: "id, code, packaged_on, brands(name)", label: row => row.code as string },
  order: { table: "orders", select: `id, status, ${ORDER}`, label: orderName },
  invoice: { table: "invoices", select: `id, kind, ${INVOICE}`, label: invoiceName },
  po: { table: "purchase_orders", select: `id, status, ${PO}`, label: poName },
  batch: { table: "batches", select: `id, planned_on, ${BATCH}`, label: batchName },
  packaging_run: { table: "packaging_runs", select: `id, planned_on, ${RUN}`, label: runName },
  transfer: { table: "stock_transfers", select: `id, status, ${TRANSFER}`, label: transferName },
  route: { table: "routes", select: "id, name, delivery_date", label: named },
  recipe: { table: "recipes", select: "id, name", label: named },
  vessel: { table: "vessels", select: "id, name, kind, capacity_bbl", label: named },
  vendor: { table: "vendors", select: "id, name", label: named },
  ship_to: { table: "ship_tos", select: "id, label, customer_id, customers(name)", label: row => row.label as string },
  material: { table: "materials", select: "id, name, category", label: named },
  keg_pool: { table: "keg_pools", select: "id, name", label: named },
  bin: { table: "bins", select: "id, name, location_id, locations(name)", label: named },
  license: { table: "brewery_state_licenses", select: "id, state, kind, license_no", label: row => row.license_no as string },
  water_profile: { table: "water_profiles", select: "id, name", label: named },

  // Catalog, places and settings.
  location: { table: "locations", select: "id, name", label: named },
  brand: { table: "brands", select: "id, name", label: named },
  format: { table: "formats", select: "id, name", label: named },
  price_group: { table: "price_groups", select: "id, name", label: named },
  sale_channel: { table: "sale_channels", select: "id, name", label: named },
  brand_approval: { table: "brand_approvals", select: "id, kind, ttb_id, brands(name)", label: row => `${sentenceCase(row.kind as string)} ${row.ttb_id} · ${name(row.brands)}` },
  notification_destination: { table: "notification_destinations", select: "id, kind, external_destination_id", label: row => `${sentenceCase(row.kind as string)} · ${row.external_destination_id}` },

  // Lines and other rows that live on a document.
  order_line: { table: "order_lines", select: `id, skus(name), orders(${ORDER})`, label: row => `${name(row.skus)} on ${orderName(row.orders as Row)}` },
  invoice_line: { table: "invoice_lines", select: `id, description, invoices(${INVOICE})`, label: row => `${row.description} on ${invoiceName(row.invoices as Row)}` },
  po_line: { table: "purchase_order_lines", select: `id, materials(name), purchase_orders(${PO})`, label: row => `${name(row.materials)} on ${poName(row.purchase_orders as Row)}` },
  stock_transfer_line: {
    table: "stock_transfer_lines", select: `id, skus(name), materials(name), keg_pools(name), stock_transfers(${TRANSFER})`,
    label: row => `${name(row.skus) || name(row.materials) || name(row.keg_pools)} on ${transferName(row.stock_transfers as Row)}`,
  },
  taproom_count: { table: "taproom_counts", select: "id, counted_on, locations(name)", label: row => `Taproom ${countName(row)}` },
  taproom_count_line: { table: "taproom_count_lines", select: "id, skus(name), taproom_counts(counted_on, locations(name))", label: row => `${name(row.skus)} on the ${countName(row.taproom_counts as Row)}` },
  invoice_payment: { table: "invoice_payments", select: `id, amount_cents, invoices(${INVOICE})`, label: row => `${money(row.amount_cents as number)} on ${invoiceName(row.invoices as Row)}` },
  invoice_question: { table: "invoice_questions", select: `id, body, invoices(${INVOICE})`, label: row => `Question on ${invoiceName(row.invoices as Row)}: ${row.body}` },
  receipt: { table: "receipts", select: `id, received_on, purchase_orders(${PO})`, label: row => `Receipt on ${poName(row.purchase_orders as Row)}, ${date(row.received_on)}` },
  material_contract: { table: "material_contracts", select: "id, contract_no, materials(name), vendors(name)", label: row => `${row.contract_no ?? "Contract"} · ${name(row.materials)} from ${name(row.vendors)}` },

  // Shipping.
  shipment: { table: "shipments", select: `id, orders(${ORDER})`, label: row => `Shipment of ${orderName(row.orders as Row)}` },
  delivery: {
    table: "deliveries", select: `id, stop_no, routes(name), shipments(orders(${ORDER})), stock_transfers(${TRANSFER})`,
    label: row => {
      const shipment = row.shipments as { orders: Row } | null;
      return `Stop ${row.stop_no} on ${name(row.routes)}: ${shipment ? orderName(shipment.orders) : transferName(row.stock_transfers as Row)}`;
    },
  },

  // Stock and the cellar.
  movement: { table: "inventory_movements", select: "id, qty, type, occurred_on, skus(name)", label: row => `${row.qty} × ${name(row.skus)}, ${sentenceCase(row.type as string)} on ${date(row.occurred_on)}` },
  allocation: { table: "allocations", select: "id, qty, skus(name)", label: row => `Allocation of ${row.qty} × ${name(row.skus)}` },
  occupancy: { table: "vessel_occupancies", select: `id, vessels(name), batches(${BATCH})`, label: row => `${batchName(row.batches as Row)} in ${name(row.vessels)}` },
  volume_adjustment: { table: "volume_adjustments", select: `id, bbl, reason, vessel_occupancies(batches(${BATCH}))`, label: row => `${row.bbl} bbl ${row.reason} on ${batchName((row.vessel_occupancies as { batches: Row }).batches)}` },
  tap_interval: { table: "tap_intervals", select: "id, tap_number, label, skus(name), locations(name)", label: row => `Tap ${row.tap_number} at ${name(row.locations)}: ${row.label ?? name(row.skus)}` },

  // Recipes, brewing and packaging records.
  recipe_version: { table: "recipe_versions", select: "id, version, recipes(name)", label: recipeVersionName },
  recipe_ingredient: { table: "recipe_ingredients", select: "id, materials(name), recipe_versions(version, recipes(name))", label: row => `${name(row.materials)} in ${recipeVersionName(row.recipe_versions as Row)}` },
  brew_record: { table: "brew_records", select: `id, brewed_on, batches(${BATCH})`, label: row => `Brew record for ${batchName(row.batches as Row)}, ${date(row.brewed_on)}` },
  packaging_material_record: { table: "packaging_material_records", select: `id, packaging_runs(${RUN})`, label: row => `Material record for ${runName(row.packaging_runs as Row)}` },
  packaging_output_correction: { table: "packaging_output_corrections", select: `id, packaging_runs(${RUN})`, label: row => `Output correction on ${runName(row.packaging_runs as Row)}` },

  // Integrations. Square and QuickBooks records are keyed by the outside system's id.
  qbo_connection: { table: "qbo_connections", select: "id, realm_id, realm_label", label: row => (row.realm_label ?? row.realm_id) as string },
  pos_connection: { table: "pos_connections", select: "id, merchant_id, merchant_label", label: row => (row.merchant_label ?? row.merchant_id) as string },
  qbo_customer: { table: "qbo_customer_snapshots", select: "qbo_customer_id, display_name", key: "qbo_customer_id", label: row => row.display_name as string },
  pos_location: { table: "pos_locations", select: "external_location_id, external_name", key: "external_location_id", label: row => row.external_name as string },
  pos_item: { table: "pos_catalog_variations", select: "external_item_id, external_item_name", key: "external_item_id", label: row => row.external_item_name as string },
  pos_variation: {
    table: "pos_catalog_variations", select: "external_variation_id, external_item_name, external_variation_name", key: "external_variation_id",
    // Square may leave both names out; an empty name then shows as an unrecognised record.
    label: row => [row.external_item_name, row.external_variation_name].filter(Boolean).join(" · "),
  },
} as const satisfies Record<string, RecordLabel>;
