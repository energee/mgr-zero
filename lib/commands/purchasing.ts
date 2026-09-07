// lib/commands/purchasing.ts — vendors, materials, contracts, purchase orders
// (draft → mark sent → receive), drafting POs from planning gaps, and material
// cycle counts. Lead time is the vendor's (spec 2026-09-07 §3); open balance,
// observed lead time and contract drawdown are views, never stored (§2–§4);
// marking a PO sent is an attestation, so no email leaves here (§1).
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, CommandError } from "./registry";
import { isoDate } from "./packaging";

const PURCHASING = ["admin", "warehouse", "brewer"] as const;
const MATERIAL_CATEGORIES = ["malt", "hop", "yeast", "adjunct", "chemical", "packaging", "other"] as const;
const UOMS = ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"] as const;
const PAYMENT_TERMS = ["due_on_receipt", "net15", "net30"] as const;
// Purchase orders are the warehouse's: a brewer reads materials and vendors but
// does not place or receive orders (Purchase orders / Receive PO screens).
const PO_ROLES = ["admin", "warehouse"] as const;
// 'direct' (MGR sends the email) is not offered until a provider is approved (spec §1).
const SENT_VIA = ["mailto", "external"] as const;

defineCommand({
  name: "upsert_vendor", description: "Create or edit a supplier: contact, payment terms, and the typed lead time Planning dates a buy-by from",
  input: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    email: z.string().email().optional(),
    phone: z.string().trim().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    paymentTerms: z.enum(PAYMENT_TERMS).optional(),
    active: z.boolean().optional(),
  }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_vendor", {
    p_brewery: ctx.breweryId, p_vendor: i.id ?? null, p_name: i.name, p_email: i.email ?? null, p_phone: i.phone ?? null,
    p_lead_time_days: i.leadTimeDays ?? null, p_payment_terms: i.paymentTerms ?? null, p_active: i.active ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_material",
  description: "Create or edit a material definition: kind, base and purchase units with the factor between them, lot tracking, default vendor. Units are refused once movements exist",
  input: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    category: z.enum(MATERIAL_CATEGORIES),
    baseUom: z.enum(UOMS),
    purchaseUom: z.enum(UOMS),
    purchaseUomFactor: z.number().positive().optional(),
    lotTracked: z.boolean().optional(),
    defaultVendorId: z.string().uuid().optional(),
    reorderPoint: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
  }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_material", {
    p_brewery: ctx.breweryId, p_material: i.id ?? null, p_name: i.name, p_category: i.category, p_base_uom: i.baseUom,
    p_purchase_uom: i.purchaseUom, p_purchase_uom_factor: i.purchaseUomFactor ?? null, p_lot_tracked: i.lotTracked ?? null,
    p_default_vendor: i.defaultVendorId ?? null, p_reorder_point: i.reorderPoint ?? null, p_active: i.active ?? null,
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_material_contract",
  description: "Create or edit a purchasing commitment for one material with one vendor; releases are ordered against it all year, and it never gates ordering",
  input: z.object({
    id: z.string().uuid().optional(),
    vendorId: z.string().uuid(),
    materialId: z.string().uuid(),
    qtyCommitted: z.number().positive(),
    unitCostCents: z.number().int().nonnegative().optional(),
    startsOn: z.string().date().optional(),
    endsOn: z.string().date().optional(),
    contractNo: z.string().trim().optional(),
  }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_material_contract", {
    p_brewery: ctx.breweryId, p_contract: i.id ?? null, p_vendor: i.vendorId, p_material: i.materialId,
    p_qty_committed: i.qtyCommitted, p_unit_cost_cents: i.unitCostCents ?? null, p_starts_on: i.startsOn ?? null,
    p_ends_on: i.endsOn ?? null, p_contract_no: i.contractNo ?? null, p_request_id: execution.requestId,
  })),
});

// Vendors with their contracts nested, each contract carrying the four
// drawdown numbers from contract_balances (committed, received, on order,
// available) so Contracts and Contract read the same figures.
defineQuery({
  name: "list_vendors_and_contracts", description: "Vendors, alphabetical, with typed and observed lead time and each one's contracts and their drawdown (committed, received, on order, available)",
  input: z.object({}), roles: [...PURCHASING],
  handler: async (ctx) => {
    const [vendors, contracts, balances, materials, observed] = await Promise.all([
      unwrap(ctx.db.from("vendors").select("id, name, email, phone, payment_terms, lead_time_days, active").eq("brewery_id", ctx.breweryId).order("name")),
      unwrap(ctx.db.from("material_contracts").select("id, vendor_id, material_id, contract_no, unit_cost_cents, starts_on, ends_on").eq("brewery_id", ctx.breweryId).order("created_at")),
      unwrap(ctx.db.from("contract_balances").select("contract_id, qty_committed, qty_received, qty_on_order, qty_available").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("materials").select("id, name").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("vendor_lead_times").select("vendor_id, sent_via, n, avg_lead_days, avg_first_lead_days, avg_late_days").eq("brewery_id", ctx.breweryId)),
    ]);
    const balance = new Map((balances ?? []).map((b) => [b.contract_id as string, b]));
    const materialName = new Map((materials ?? []).map((m) => [m.id as string, m.name as string]));
    return (vendors ?? []).map((v) => ({
      ...v,
      // Observed, never stored: n says how weak the evidence is ("14 days (n=3)").
      observed: (observed ?? []).filter((o) => o.vendor_id === v.id).map((o) => ({
        sent_via: o.sent_via as string, n: o.n as number, avg_lead_days: Number(o.avg_lead_days),
        avg_first_lead_days: Number(o.avg_first_lead_days), avg_late_days: Number(o.avg_late_days),
      })),
      contracts: (contracts ?? []).filter((c) => c.vendor_id === v.id).map((c) => {
        const b = balance.get(c.id as string);
        return {
          id: c.id, material_id: c.material_id, contract_no: c.contract_no, unit_cost_cents: c.unit_cost_cents,
          starts_on: c.starts_on, ends_on: c.ends_on, material_name: materialName.get(c.material_id as string) ?? null,
          qty_committed: Number(b?.qty_committed ?? 0), qty_received: Number(b?.qty_received ?? 0),
          qty_on_order: Number(b?.qty_on_order ?? 0), qty_available: Number(b?.qty_available ?? 0),
        };
      }),
    }));
  },
});

// Serves the Materials list, the recipe ingredient picker (extract_potential:
// a null one contributes no gravity) and PO/count line pickers. Inactive
// materials are hidden unless asked for: history keeps them, pickers do not.
defineQuery({
  name: "list_materials", description: "Materials, alphabetical, with kind, units, lot tracking, default vendor, and extract potential",
  input: z.object({ includeInactive: z.boolean().optional() }), roles: [...PURCHASING],
  handler: (ctx, i) => {
    let q = ctx.db.from("materials")
      .select("id, name, category, base_uom, purchase_uom, purchase_uom_factor, lot_tracked, default_vendor_id, reorder_point, extract_potential, active")
      .eq("brewery_id", ctx.breweryId).order("name");
    if (!i.includeInactive) q = q.eq("active", true);
    return unwrap(q);
  },
});

// On hand per material at bin grain (material_bin_on_hand), optionally one
// location: Materials on hand reads it, Cycle count snapshots it as qty_expected.
defineQuery({
  name: "get_material_on_hand", description: "Material on hand by location and bin, in base units; optionally one location",
  input: z.object({ locationId: z.string().uuid().optional() }), roles: [...PURCHASING],
  handler: (ctx, i) => {
    let q = ctx.db.from("material_bin_on_hand").select("material_id, location_id, bin_id, qty").eq("brewery_id", ctx.breweryId);
    if (i.locationId) q = q.eq("location_id", i.locationId);
    return unwrap(q);
  },
});

const poLine = z.object({
  materialId: z.string().uuid(),
  qtyOrdered: z.number().positive(),
  unitCostCents: z.number().int().nonnegative().optional(),
  contractId: z.string().uuid().optional(),
  expectedLotCode: z.string().trim().optional(),
});

defineCommand({
  name: "create_purchase_order",
  description: "Draft a purchase order with all its lines in one write; a contracted line takes the contract price unless one is typed, and the expected lot is advisory",
  input: z.object({ vendorId: z.string().uuid(), expectedOn: isoDate.optional(), note: z.string().optional(), lines: z.array(poLine).min(1) }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("create_purchase_order", {
    p_brewery: ctx.breweryId, p_vendor: i.vendorId, p_expected_on: i.expectedOn ?? null, p_note: i.note ?? null,
    p_lines: i.lines.map((l) => ({
      material_id: l.materialId, qty_ordered: l.qtyOrdered, unit_cost_cents: l.unitCostCents ?? null,
      contract_id: l.contractId ?? null, expected_lot_code: l.expectedLotCode ?? null,
    })),
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "send_purchase_order",
  description: "Mark a draft purchase order sent by mail client (mailto) or outside MGR (external): an attestation, dated today; no email is sent",
  input: z.object({ poId: z.string().uuid(), sentVia: z.enum(SENT_VIA) }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("send_purchase_order", {
    p_brewery: ctx.breweryId, p_po: i.poId, p_sent_via: i.sentVia, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "receive_purchase_order",
  description: "Count what arrived against a sent purchase order at one bin: receipt, lines (over or short both allowed), lots read off the package, and receipt movements in one write; status derives from the counts",
  input: z.object({
    poId: z.string().uuid(), locationId: z.string().uuid(), binId: z.string().uuid(), receivedOn: isoDate.optional(),
    lines: z.array(z.object({
      poLineId: z.string().uuid(), qtyCounted: z.number().nonnegative(),
      lotCode: z.string().trim().optional(), bestBy: isoDate.optional(),
    })),
  }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("receive_purchase_order", {
    p_brewery: ctx.breweryId, p_po: i.poId, p_location: i.locationId, p_bin: i.binId, p_received_on: i.receivedOn ?? null,
    p_lines: i.lines.map((l) => ({ po_line_id: l.poLineId, qty_counted: l.qtyCounted, lot_code: l.lotCode ?? null, best_by: l.bestBy ?? null })),
    p_request_id: execution.requestId,
  })),
});

const PO_COLUMNS = "id, po_no, vendor_id, status, ordered_on, expected_on, sent_via, sent_by, note, created_at";
const OPEN_STATUSES = ["draft", "sent", "partially_received"];

defineQuery({
  name: "list_purchase_orders", description: "Open purchase orders (draft, sent, partially received) with vendor and what each still owes; includeClosed adds received and cancelled",
  input: z.object({ includeClosed: z.boolean().optional() }), roles: [...PO_ROLES],
  handler: async (ctx, i) => {
    let q = ctx.db.from("purchase_orders").select(`${PO_COLUMNS}, vendors(name)`).eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false });
    if (!i.includeClosed) q = q.in("status", OPEN_STATUSES);
    const [pos, open] = await Promise.all([
      unwrap(q),
      unwrap(ctx.db.from("po_open_balances").select("po_id, qty_open").eq("brewery_id", ctx.breweryId)),
    ]);
    return (pos ?? []).map(({ vendors, ...po }) => ({
      ...po, vendor_name: (vendors as unknown as { name: string } | null)?.name ?? null,
      lines_open: (open ?? []).filter((o) => o.po_id === po.id && Number(o.qty_open) > 0).length,
    }));
  },
});

// Lines carry ordered / received / open from po_open_balances (derived, never
// stored) plus the material's name, units and lot tracking, so Receive PO
// knows which lines ask for a lot; receipts list what has posted so far.
defineQuery({
  name: "get_purchase_order", description: "One purchase order with vendor, lines (ordered, received so far, still open), and its receipts",
  input: z.object({ poId: z.string().uuid() }), roles: [...PO_ROLES],
  handler: async (ctx, i) => {
    const [po, lines, balances, receipts] = await Promise.all([
      unwrap(ctx.db.from("purchase_orders").select(`${PO_COLUMNS}, vendors(name, email)`).eq("brewery_id", ctx.breweryId).eq("id", i.poId).maybeSingle()),
      unwrap(ctx.db.from("purchase_order_lines").select("id, material_id, qty_ordered, unit_cost_cents, contract_id, expected_lot_code, materials(name, purchase_uom, purchase_uom_factor, base_uom, lot_tracked)").eq("po_id", i.poId)),
      unwrap(ctx.db.from("po_open_balances").select("po_line_id, qty_received, qty_open").eq("po_id", i.poId)),
      unwrap(ctx.db.from("receipts").select("id, received_on, received_by, note, receipt_lines(po_line_id, qty_expected, qty_counted, variance, lot_id)").eq("po_id", i.poId).order("received_on")),
    ]);
    if (!po) throw new CommandError("purchase order not found", 404, "not_found");
    const balance = new Map((balances ?? []).map((b) => [b.po_line_id as string, b]));
    const { vendors, ...header } = po;
    return {
      ...header, vendor: vendors as unknown as { name: string; email: string | null } | null,
      lines: (lines ?? []).map(({ materials, ...l }) => ({
        ...l, qty_ordered: Number(l.qty_ordered), material: materials as unknown as { name: string; purchase_uom: string; purchase_uom_factor: number; base_uom: string; lot_tracked: boolean } | null,
        qty_received: Number(balance.get(l.id as string)?.qty_received ?? 0), qty_open: Number(balance.get(l.id as string)?.qty_open ?? l.qty_ordered),
      })),
      receipts: receipts ?? [],
    };
  },
});

// Planning's material gaps: the material_requirements view (demand, supply,
// gap, needed-by, resolved vendor and contract) with names and the vendor's
// typed lead time, so the page can date a buy-by and name the drafts.
defineQuery({
  name: "get_material_requirements",
  description: "Material gaps for Planning: required, on hand, on order, short (base units), whole purchase units short, needed-by date, and the vendor and contract each gap resolves to; a null vendor cannot draft",
  input: z.object({}), roles: [...PURCHASING],
  handler: async (ctx) => {
    const [rows, materials, vendors] = await Promise.all([
      unwrap(ctx.db.from("material_requirements").select("material_id, required, on_hand, on_order, short, needed_by, purchase_units_short, vendor_id, contract_id").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("materials").select("id, name, base_uom, purchase_uom, purchase_uom_factor").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("vendors").select("id, name, lead_time_days").eq("brewery_id", ctx.breweryId)),
    ]);
    const material = new Map((materials ?? []).map((m) => [m.id as string, m]));
    const vendor = new Map((vendors ?? []).map((v) => [v.id as string, v]));
    return (rows ?? []).map((r) => {
      const m = material.get(r.material_id as string);
      const v = r.vendor_id ? vendor.get(r.vendor_id as string) : undefined;
      return {
        material_id: r.material_id, material_name: m?.name ?? null, base_uom: m?.base_uom ?? null, purchase_uom: m?.purchase_uom ?? null,
        required: Number(r.required), on_hand: Number(r.on_hand), on_order: Number(r.on_order), short: Number(r.short),
        purchase_units_short: Number(r.purchase_units_short), needed_by: r.needed_by,
        vendor_id: r.vendor_id ?? null, vendor_name: v?.name ?? null, lead_time_days: v?.lead_time_days ?? null, contract_id: r.contract_id ?? null,
      };
    }).sort((a, b) => (a.needed_by ?? "").localeCompare(b.needed_by ?? "") || (a.material_name ?? "").localeCompare(b.material_name ?? ""));
  },
});

defineCommand({
  name: "draft_purchase_order_from_requirements",
  description: "Draft one purchase order per vendor for the chosen material gaps, quantities rounded up to whole purchase units, contract price up to the available commitment; materials with no vendor are skipped and named",
  input: z.object({ materialIds: z.array(z.string().uuid()).min(1) }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("draft_purchase_order_from_requirements", {
    p_brewery: ctx.breweryId, p_materials: i.materialIds, p_request_id: execution.requestId,
  })),
});
