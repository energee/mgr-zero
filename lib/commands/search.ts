// lib/commands/search.ts — registered `search_entities`: one search across the
// entity kinds staff may read (SKUs, orders, invoices, lots, customers,
// purchase orders, batches). A document number (ORD-0231, INV-1042, PO-0142,
// B-0012, L-240831-HZ) matches exactly and sorts first; names match on prefix.
// Reads go through the RLS-bound ctx.db, so RLS decides the rows either way
// and `kinds` only narrows. A kind whose page the caller's role cannot open is
// not searched at all (openableKinds), so no hit links to No access (#478).
// ponytail: eight prefix queries in parallel rather than one definer SQL function; a trigram index is the upgrade path if a
// brewery's catalog outgrows prefix matching.
import { z } from "zod";
import { canRun, defineQuery, unwrap, type Ctx } from "./registry";
import { formatDate } from "@/lib/date-format";
import { docNo, poNo, batNo } from "@/lib/mgr/doc-no";
import { escapeRegex } from "@/lib/escape-regex";
import { sentenceCase } from "@/lib/mgr/labels";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/mgr/search-view";

export const SEARCH_KINDS = ["sku", "order", "invoice", "lot", "customer", "po", "batch", "material_lot"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export type SearchHit = { kind: SearchKind; id: string; label: string; detail: string; href: string; exact: boolean };

const LIMIT = 25;
/** A document prefix, its kind, and the number column it names. */
const DOC: [RegExp, SearchKind, string][] = [[/^ORD-?(\d+)$/i, "order", "order_no"], [/^INV-?(\d+)$/i, "invoice", "invoice_no"], [/^PO-?(\d+)$/i, "po", "po_no"], [/^B-?(\d+)$/i, "batch", "batch_no"]];

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
};

/** The kinds whose result page `ctx`'s role may open. */
export const openableKinds = (ctx: Ctx, kinds: readonly SearchKind[]) =>
  kinds.filter((k) => PAGE_READS[k].every((name) => canRun(ctx, name)));

type Row = Record<string, unknown>;

async function byKind(ctx: Ctx, kind: SearchKind, q: string): Promise<SearchHit[]> {
  const b = ctx.breweryId;
  const prefix = `^${escapeRegex(q)}`; // an anchored imatch: case-insensitive prefix
  const doc = DOC.find(([re, k]) => k === kind && re.test(q));
  // The prefixes accept unbounded digits; a value past int4 would make Postgres
  // raise rather than simply not match, so it is no match here.
  const parsed = doc ? Number(q.match(doc[0])![1]) : null;
  const n = parsed !== null && Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647 ? parsed : null;
  const hit = (id: string, label: string, detail: string, href: string, exact = false): SearchHit => ({ kind, id, label, detail, href, exact });
  switch (kind) {
    case "sku": {
      // A SKU matches on its own name or its brand's staff-only alias ("Animal #14").
      // PostgREST cannot `or` a column with an embedded one, so two prefix reads merge.
      const [byName, byAlias] = await Promise.all([
        unwrap(ctx.db.from("skus").select("id, name, brands(name)").eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)),
        unwrap(ctx.db.from("skus").select("id, name, brands!inner(name)").eq("brewery_id", b).regexIMatch("brands.alias", prefix).limit(LIMIT)),
      ]) as [Row[], Row[]];
      const rows = [...new Map([...byName, ...byAlias].map((r) => [r.id as string, r])).values()].slice(0, LIMIT);
      return rows.map((r) => hit(r.id as string, r.name as string, (r.brands as { name: string } | null)?.name ?? "SKU", `/catalog`));
    }
    case "customer": {
      const rows = await unwrap(ctx.db.from("customers").select("id, name, state").eq("brewery_id", b).regexIMatch("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, r.name as string, `customer · ${r.state}`, `/customers/${r.id}`));
    }
    case "material_lot": {
      const rows = await unwrap(ctx.db.from("material_lots").select("id,lot_code,materials(name)").eq("brewery_id", b).regexIMatch("lot_code", prefix).limit(LIMIT)) as Row[];
      return rows.map(row => hit(row.id as string, row.lot_code as string, `${(row.materials as { name: string } | null)?.name ?? "Material"} · ingredient lot`, `/compliance/material-lots/${row.id}`, (row.lot_code as string).toLowerCase() === q.toLowerCase()));
    }
    case "lot": {
      const rows = await unwrap(ctx.db.from("lots").select("id, code, packaged_on, brands(name)").eq("brewery_id", b).regexIMatch("code", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, r.code as string, `${(r.brands as { name: string } | null)?.name ?? "lot"} · packaged ${formatDate(r.packaged_on as string)}`, `/compliance/lots/${r.id}`, (r.code as string).toLowerCase() === q.toLowerCase()));
    }
    case "order": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("orders").select("id, order_no, status, customers(name)").eq("brewery_id", b).eq("order_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${docNo("ORD", r.order_no as number, "Order")} · ${(r.customers as { name: string } | null)?.name ?? "transfer"}`, sentenceCase(r.status as string), `/orders/${r.id}`, true));
    }
    case "invoice": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("invoices").select("id, invoice_no, kind, customers(name)").eq("brewery_id", b).eq("invoice_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${docNo("INV", r.invoice_no as number, "Invoice")} · ${(r.customers as { name: string } | null)?.name ?? ""}`, sentenceCase(r.kind as string), `/invoices/${r.id}`, true));
    }
    case "po": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("purchase_orders").select("id, po_no, status, vendors(name)").eq("brewery_id", b).eq("po_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${poNo(r.po_no as number)} · ${(r.vendors as { name: string } | null)?.name ?? ""}`, sentenceCase(r.status as string), `/purchase-orders/${r.id}`, true));
    }
    case "batch": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("batches").select("id, batch_no, planned_on, brands!batches_intended_brand_id_brewery_id_fkey(name)").eq("brewery_id", b).eq("batch_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${batNo(r.batch_no as number)} · ${(r.brands as { name: string } | null)?.name ?? ""}`, `planned ${formatDate(r.planned_on as string)}`, `/batches/${r.id}`, true));
    }
  }
}

defineQuery({
  name: "search_entities",
  description: "Search SKUs, orders, invoices, lots, material lots, customers, purchase orders and batches by name prefix or exact document number (ORD-, INV-, PO-, B-, L-); exact numbers sort first; RLS decides the rows, kinds only narrow, and kinds whose page the caller's role cannot open are skipped",
  input: z.object({ q: z.string().trim().min(1).max(SEARCH_QUERY_MAX_LENGTH), kinds: z.array(z.enum(SEARCH_KINDS)).max(SEARCH_KINDS.length).optional() }),
  roles: ["admin", "sales", "warehouse", "brewer"],
  aiExposed: true,
  handler: async (ctx, i): Promise<SearchHit[]> => {
    const kinds = openableKinds(ctx, [...new Set(i.kinds?.length ? i.kinds : SEARCH_KINDS)]);
    const hits = (await Promise.all(kinds.map((k) => byKind(ctx, k, i.q)))).flat();
    return hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label)).slice(0, LIMIT);
  },
});
