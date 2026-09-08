// lib/commands/search.ts — registered `search_entities`: one search across the
// entity kinds staff may read (SKUs, orders, invoices, lots, customers,
// purchase orders, batches). A document number (ORD-0231, INV-1042, PO-0142,
// B-0012, L-240831-HZ) matches exactly and sorts first; names match on prefix.
// Reads go through the RLS-bound ctx.db, so RLS decides the rows either way
// and `kinds` only narrows. ponytail: seven prefix queries in parallel rather
// than one definer SQL function; a trigram index is the upgrade path if a
// brewery's catalog outgrows prefix matching.
import { z } from "zod";
import { defineQuery, STAFF_ROLES, unwrap, type Ctx } from "./registry";
import { docNo, poNo, batNo } from "@/lib/mgr/doc-no";

export const SEARCH_KINDS = ["sku", "order", "invoice", "lot", "customer", "po", "batch"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export type SearchHit = { kind: SearchKind; id: string; label: string; detail: string; href: string; exact: boolean };

const LIMIT = 25;
/** A document prefix, its kind, and the number column it names. */
const DOC: [RegExp, SearchKind, string][] = [[/^ORD-?(\d+)$/i, "order", "order_no"], [/^INV-?(\d+)$/i, "invoice", "invoice_no"], [/^PO-?(\d+)$/i, "po", "po_no"], [/^B-?(\d+)$/i, "batch", "batch_no"]];

type Row = Record<string, unknown>;
const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

async function byKind(ctx: Ctx, kind: SearchKind, q: string): Promise<SearchHit[]> {
  const b = ctx.breweryId;
  const prefix = `${escapeLike(q)}%`;
  const doc = DOC.find(([re, k]) => k === kind && re.test(q));
  const n = doc ? Number(q.match(doc[0])![1]) : null;
  const hit = (id: string, label: string, detail: string, href: string, exact = false): SearchHit => ({ kind, id, label, detail, href, exact });
  switch (kind) {
    case "sku": {
      const rows = await unwrap(ctx.db.from("skus").select("id, name, brands(name)").eq("brewery_id", b).ilike("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, r.name as string, (r.brands as { name: string } | null)?.name ?? "SKU", `/catalog`));
    }
    case "customer": {
      const rows = await unwrap(ctx.db.from("customers").select("id, name, state").eq("brewery_id", b).ilike("name", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, r.name as string, `customer · ${r.state}`, `/customers/${r.id}`));
    }
    case "lot": {
      const rows = await unwrap(ctx.db.from("lots").select("id, code, packaged_on, brands(name)").eq("brewery_id", b).ilike("code", prefix).limit(LIMIT)) as Row[];
      return rows.map((r) => hit(r.id as string, r.code as string, `${(r.brands as { name: string } | null)?.name ?? "lot"} · packaged ${r.packaged_on}`, `/compliance/lots/${r.id}`, (r.code as string).toLowerCase() === q.toLowerCase()));
    }
    case "order": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("orders").select("id, order_no, status, customers(name)").eq("brewery_id", b).eq("order_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${docNo("ORD", r.order_no as number, "Order")} · ${(r.customers as { name: string } | null)?.name ?? "transfer"}`, r.status as string, `/orders/${r.id}`, true));
    }
    case "invoice": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("invoices").select("id, invoice_no, kind, customers(name)").eq("brewery_id", b).eq("invoice_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${docNo("INV", r.invoice_no as number, "Invoice")} · ${(r.customers as { name: string } | null)?.name ?? ""}`, r.kind as string, `/invoices/${r.id}`, true));
    }
    case "po": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("purchase_orders").select("id, po_no, status, vendors(name)").eq("brewery_id", b).eq("po_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${poNo(r.po_no as number)} · ${(r.vendors as { name: string } | null)?.name ?? ""}`, r.status as string, `/purchase-orders/${r.id}`, true));
    }
    case "batch": {
      if (n === null) return [];
      const rows = await unwrap(ctx.db.from("batches").select("id, batch_no, planned_on, brands:intended_brand_id(name)").eq("brewery_id", b).eq("batch_no", n)) as Row[];
      return rows.map((r) => hit(r.id as string, `${batNo(r.batch_no as number)} · ${(r.brands as { name: string } | null)?.name ?? ""}`, `planned ${r.planned_on}`, `/batches/${r.id}`, true));
    }
  }
}

defineQuery({
  name: "search_entities",
  description: "Search SKUs, orders, invoices, lots, customers, purchase orders and batches by name prefix or exact document number (ORD-, INV-, PO-, B-, L-); exact numbers sort first; RLS decides the rows and kinds only narrow",
  input: z.object({ q: z.string().trim().min(1).max(80), kinds: z.array(z.enum(SEARCH_KINDS)).optional() }),
  roles: STAFF_ROLES,
  handler: async (ctx, i): Promise<SearchHit[]> => {
    const kinds = i.kinds?.length ? i.kinds : [...SEARCH_KINDS];
    const hits = (await Promise.all(kinds.map((k) => byKind(ctx, k, i.q)))).flat();
    return hits.sort((a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label)).slice(0, LIMIT);
  },
});
