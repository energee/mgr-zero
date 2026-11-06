import { PG_INT_MAX } from "@/lib/mgr/quantity-input";
// lib/commands/search.ts — registered `search_entities`: one search across the
// record kinds staff may read (SEARCH_KINDS). A document number (ORD-0231,
// INV-1042, PO-0142, B-0012, RUN-0007, TRF-0003, L-240831-HZ) matches exactly
// and sorts first; a bare number ("0199") matches every numbered kind; names
// match on prefix. A kind with no detail page links to its list page.
// Reads go through the RLS-bound ctx.db, so RLS decides the rows either way
// and `kinds` only narrows. A kind whose page the caller's role cannot open is
// not searched at all (openableKinds), so no hit links to No access (#478).
// Each kind's select and label come from lib/mgr/record-labels.ts.
// ponytail: one prefix query per kind in parallel rather than one definer SQL function; a trigram index is the upgrade path if a
// brewery's catalog outgrows prefix matching.
import { z } from "zod";
import { canRun, defineQuery, unwrap, type Ctx } from "./registry";
import { formatDate } from "@/lib/date-format";
import { escapeRegex, quotedRegex } from "@/lib/escape-regex";
import { sentenceCase } from "@/lib/mgr/labels";
import { RECORD_LABELS as L, type Row } from "@/lib/mgr/record-labels";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/mgr/search-view";
import { stateOrCountry } from "@/lib/mgr/ship-to-view";

export const SEARCH_KINDS = [
  "sku", "order", "invoice", "lot", "customer", "po", "batch", "material_lot", "packaging_run", "transfer", "route",
  "recipe", "vessel", "vendor", "ship_to", "material", "keg_pool", "bin", "license", "water_profile",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export type SearchHit = { kind: SearchKind; id: string; label: string; detail: string; href: string; exact: boolean };

const LIMIT = 25;
/** A document number, with or without its prefix, and the kind it names. */
const DOC: [RegExp, SearchKind][] = [
  [/^(?:ORD-?)?(\d+)$/i, "order"], [/^(?:INV-?)?(\d+)$/i, "invoice"], [/^(?:PO-?)?(\d+)$/i, "po"],
  [/^(?:B-?)?(\d+)$/i, "batch"], [/^(?:RUN-?)?(\d+)$/i, "packaging_run"], [/^(?:TRF-?)?(\d+)$/i, "transfer"],
];

/** The registry reads each kind's href page makes; the role must pass them all
 * or the page redirects to No access. Keep in step with those pages. */
const PAGE_READS: Record<SearchKind, readonly string[]> = {
  sku: ["list_brands", "list_formats", "list_price_groups"], // /catalog
  customer: ["get_customer", "list_sale_channels"], // /customers/[id]
  material_lot: ["trace_material_lot"], // /compliance/material-lots/[id]
  lot: ["trace_lot"], // /compliance/lots/[id]
  order: ["get_order", "list_locations", "list_skus"], // /orders/[id]
  invoice: ["get_invoice"], // /invoices/[id]; its other reads are role-conditional
  po: ["get_purchase_order", "list_locations", "list_bins"], // /purchase-orders/[id]
  batch: ["get_brew_day", "list_vessels"], // /batches/[id]
  packaging_run: ["get_packaging_run", "list_occupancies", "list_locations", "list_bins", "get_packaging_close_plan", "get_packaging_material_record"], // /packaging/[id]; reads by run state
  transfer: ["get_stock_transfer"], // /transfers/[id]; its stock read is role-conditional
  route: ["list_routes"], // /routes/[id]
  recipe: ["get_recipe", "list_materials", "get_gravity_unit", "list_water_profiles", "list_brands"], // /recipes/[id]
  vessel: ["list_vessels", "list_occupancies", "get_gravity_unit", "list_fermentation_readings"], // /cellar/vessels/[id]
  vendor: ["list_vendors_and_contracts", "list_materials"], // /vendors/[id]; its purchase order read is role-conditional
  ship_to: ["get_customer", "list_sale_channels"], // /customers/[id], which lists its ship-tos
  material: ["list_materials", "get_material_on_hand", "list_vendors", "list_locations", "list_bins"], // /materials
  keg_pool: ["get_keg_fleet", "list_locations", "list_bins", "list_customers", "list_vendors"], // /kegs
  bin: ["list_locations", "list_bins"], // /locations/[id]; its stock read is role-conditional
  license: ["get_compliance_registry"], // /compliance/licenses
  water_profile: ["list_water_profiles"], // /catalog/water-profiles
};

/** The kinds whose result page `ctx`'s role may open. */
export const openableKinds = (ctx: Ctx, kinds: readonly SearchKind[]) =>
  kinds.filter((k) => PAGE_READS[k].every((name) => canRun(ctx, name)));

async function byKind(ctx: Ctx, kind: SearchKind, q: string): Promise<SearchHit[]> {
  const b = ctx.breweryId;
  const prefix = `^${escapeRegex(q)}`; // an anchored imatch: case-insensitive prefix
  const doc = DOC.find(([re, k]) => k === kind && re.test(q));
  // The prefixes accept unbounded digits; a value past int4 would make Postgres
  // raise rather than simply not match, so it is no match here.
  const parsed = doc ? Number(q.match(doc[0])![1]) : null;
  const n = parsed !== null && Number.isInteger(parsed) && parsed > 0 && parsed <= PG_INT_MAX ? parsed : null;
  const hit = (id: string, label: string, detail: string, href: string, exact = false): SearchHit => ({ kind, id, label, detail, href, exact });
  const name = (embed: unknown) => (embed as { name: string } | null)?.name ?? "";
  switch (kind) {
    case "sku": {
      // A SKU matches on its own name or its brand's staff-only alias ("Field Notes #14").
      // PostgREST cannot `or` a column with an embedded one, so two prefix reads merge.
      const [byName, byAlias] = await Promise.all([
        unwrap(ctx.db.from(L.sku.table).select(L.sku.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)),
        unwrap(ctx.db.from(L.sku.table).select("id, name, brands!inner(name)").eq("brewery_id", b).regexIMatch("brands.alias", prefix).limit(LIMIT)),
      ]) as [Row[], Row[]];
      const rows = [...new Map([...byName, ...byAlias].map((r) => [r.id as string, r])).values()].slice(0, LIMIT);
      return rows.map((r) => hit(r.id as string, L.sku.label(r), (r.brands as { name: string } | null)?.name ?? "SKU", `/catalog`));
    }
    case "customer": {
      // A customer matches on its name or its staff-only alias, as list_customers does.
      const pattern = quotedRegex(prefix);
      const rows = await unwrap(ctx.db.from(L.customer.table).select(L.customer.select).eq("brewery_id", b).or(`name.imatch.${pattern},alias.imatch.${pattern}`).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.customer.label(r), `customer · ${stateOrCountry(r as { country: string; state: string | null })}`, `/customers/${r.id}`));
    }
    case "material_lot": {
      const rows = await unwrap(ctx.db.from(L.material_lot.table).select(L.material_lot.select).eq("brewery_id", b).regexIMatch("lot_code", prefix).limit(LIMIT)) as Row[];
      return rows.map(row => hit(row.id as string, L.material_lot.label(row), `${(row.materials as { name: string } | null)?.name ?? "Material"} · ingredient lot`, `/compliance/material-lots/${row.id}`, (row.lot_code as string).toLowerCase() === q.toLowerCase()));
    }
    case "lot": {
      const rows = await unwrap(ctx.db.from(L.lot.table).select(L.lot.select).eq("brewery_id", b).regexIMatch("code", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.lot.label(r), `${(r.brands as { name: string } | null)?.name ?? "lot"} · packaged ${formatDate(r.packaged_on as string)}`, `/compliance/lots/${r.id}`, (r.code as string).toLowerCase() === q.toLowerCase()));
    }
    case "order": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.order.table).select(L.order.select).eq("brewery_id", b).eq("order_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, L.order.label(r), sentenceCase(r.status as string), `/orders/${r.id}`, true));
    }
    case "invoice": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.invoice.table).select(L.invoice.select).eq("brewery_id", b).eq("invoice_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, L.invoice.label(r), sentenceCase(r.kind as string), `/invoices/${r.id}`, true));
    }
    case "po": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.po.table).select(L.po.select).eq("brewery_id", b).eq("po_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, L.po.label(r), sentenceCase(r.status as string), `/purchase-orders/${r.id}`, true));
    }
    case "batch": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.batch.table).select(L.batch.select).eq("brewery_id", b).eq("batch_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, L.batch.label(r), `planned ${formatDate(r.planned_on as string)}`, `/batches/${r.id}`, true));
    }
    case "packaging_run": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.packaging_run.table).select(L.packaging_run.select).eq("brewery_id", b).eq("run_no", n).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.packaging_run.label(r), `planned ${formatDate(r.planned_on as string)}`, `/packaging/${r.id}`, true));
    }
    case "transfer": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from(L.transfer.table).select(L.transfer.select).eq("brewery_id", b).eq("transfer_no", n).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.transfer.label(r), sentenceCase(r.status as string), `/transfers/${r.id}`, true));
    }
    case "route": {
      const rows = await unwrap(ctx.db.from(L.route.table).select(L.route.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.route.label(r), `Route · ${formatDate(r.delivery_date as string)}`, `/routes/${r.id}`));
    }
    case "recipe": {
      const rows = await unwrap(ctx.db.from(L.recipe.table).select(L.recipe.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.recipe.label(r), "Recipe", `/recipes/${r.id}`));
    }
    case "vessel": {
      const rows = await unwrap(ctx.db.from(L.vessel.table).select(L.vessel.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.vessel.label(r), `${sentenceCase(r.kind as string)} · ${r.capacity_bbl} bbl`, `/cellar/vessels/${r.id}`));
    }
    case "vendor": {
      const rows = await unwrap(ctx.db.from(L.vendor.table).select(L.vendor.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.vendor.label(r), "Vendor", `/vendors/${r.id}`));
    }
    case "ship_to": {
      const rows = await unwrap(ctx.db.from(L.ship_to.table).select(L.ship_to.select).eq("brewery_id", b).regexIMatch("label", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.ship_to.label(r), `Ship-to · ${name(r.customers)}`, `/customers/${r.customer_id}`));
    }
    case "material": {
      const rows = await unwrap(ctx.db.from(L.material.table).select(L.material.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.material.label(r), `Material · ${sentenceCase(r.category as string)}`, "/materials"));
    }
    case "keg_pool": {
      const rows = await unwrap(ctx.db.from(L.keg_pool.table).select(L.keg_pool.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.keg_pool.label(r), "Keg pool", "/kegs"));
    }
    case "bin": {
      const rows = await unwrap(ctx.db.from(L.bin.table).select(L.bin.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.bin.label(r), `Bin · ${name(r.locations)}`, `/locations/${r.location_id}`));
    }
    case "license": {
      const rows = await unwrap(ctx.db.from(L.license.table).select(L.license.select).eq("brewery_id", b).regexIMatch("license_no", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.license.label(r), `${r.state} ${r.kind} license`, "/compliance/licenses"));
    }
    case "water_profile": {
      const rows = await unwrap(ctx.db.from(L.water_profile.table).select(L.water_profile.select).eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, L.water_profile.label(r), "Water profile", "/catalog/water-profiles"));
    }
  }
}

defineQuery({
  name: "search_entities",
  description: "Search SKUs, orders, invoices, lots, material lots, customers, purchase orders, batches, packaging runs, transfers, routes, recipes, vessels, vendors, ship-tos, materials, keg pools, bins, state licenses and water profiles by name prefix or exact document number (ORD-, INV-, PO-, B-, RUN-, TRF-, L-); a bare number matches every numbered kind; exact numbers sort first; kinds without a detail page link to their list page; RLS decides the rows, kinds only narrow, and kinds whose page the caller's role cannot open are skipped",
  input: z.object({ q: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH), kinds: z.array(z.enum(SEARCH_KINDS)).max(SEARCH_KINDS.length).optional() }),
  roles: ["admin", "sales", "warehouse", "brewer"],
  handler: async (ctx, i): Promise<SearchHit[]> => {
    const kinds = openableKinds(ctx, [...new Set(i.kinds?.length ? i.kinds : SEARCH_KINDS)]);
    const hits = (await Promise.all(kinds.map((k) => byKind(ctx, k, i.q)))).flat();
    return hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label)).slice(0, LIMIT);
  },
});
