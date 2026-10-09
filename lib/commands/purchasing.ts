// lib/commands/purchasing.ts — vendors, materials, contracts, purchase orders
// (draft → mark sent → receive), drafting POs from planning gaps, and material
// cycle counts. Lead time is the vendor's (spec 2026-09-07 §3); open balance,
// observed lead time and contract drawdown are views, never stored (§2–§4);
// marking a PO sent is an attestation, so no email leaves here (§1).
import { z } from "zod";
import { defineCommand, defineQuery, cents, phone, unwrap, CommandError } from "./registry";
import { isoDate } from "./packaging";
import { PAYMENT_TERMS } from "@/lib/mgr/enums";

const PURCHASING = ["admin", "warehouse", "brewer"] as const;
const MATERIAL_CATEGORIES = ["malt", "hop", "yeast", "adjunct", "chemical", "packaging", "other"] as const;
const UOMS = ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"] as const;
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
    phone: phone.optional(),
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
  description: "Create or edit a material definition: kind, base and purchase units with the factor between them, lot tracking, default vendor, extract potential. Units are refused once movements, recipe ingredients, format BOM lines, PO lines, contracts or transfer lines use the material",
  input: z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    category: z.enum(MATERIAL_CATEGORIES),
    baseUom: z.enum(UOMS),
    purchaseUom: z.enum(UOMS),
    // Omitted on an edit keeps the factor the material had (#589); a new material defaults to 1.
    purchaseUomFactor: z.number().positive().optional(),
    lotTracked: z.boolean().optional(),
    defaultVendorId: z.string().uuid().optional(),
    reorderPoint: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
    // SG-style, per pound per gallon: 1.037 means 37 PPG (lib/recipe-gravity.ts).
    // The bounds catch the usual typo of points (37) for a gravity; 1.000 is
    // allowed for a mash ingredient that carries no extract (rice hulls).
    // Omitted on an edit keeps the potential the material had.
    extractPotential: z.number().min(1).max(1.05).optional(),
  }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_material", {
    p_brewery: ctx.breweryId, p_material: i.id ?? null, p_name: i.name, p_category: i.category, p_base_uom: i.baseUom,
    p_purchase_uom: i.purchaseUom, p_purchase_uom_factor: i.purchaseUomFactor ?? null, p_lot_tracked: i.lotTracked ?? null,
    p_default_vendor: i.defaultVendorId ?? null, p_reorder_point: i.reorderPoint ?? null, p_active: i.active ?? null,
    p_extract_potential: i.extractPotential ?? null, p_request_id: execution.requestId,
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
    unitCostCents: cents.optional(),
    startsOn: isoDate.optional(),
    endsOn: isoDate.optional(),
    contractNo: z.string().trim().optional(),
  }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_material_contract", {
    p_brewery: ctx.breweryId, p_contract: i.id ?? null, p_vendor: i.vendorId, p_material: i.materialId,
    p_qty_committed: i.qtyCommitted, p_unit_cost_cents: i.unitCostCents ?? null, p_starts_on: i.startsOn ?? null,
    p_ends_on: i.endsOn ?? null, p_contract_no: i.contractNo ?? null, p_request_id: execution.requestId,
  })),
});

// The picker's list: PO and material forms need a name, not the contract report.
defineQuery({
  name: "list_vendors", description: "Vendors, alphabetical, with active flag and typed lead time",
  input: z.object({}), roles: [...PURCHASING],
  handler: (ctx) => unwrap(ctx.db.from("vendors").select("id, name, active, lead_time_days").eq("brewery_id", ctx.breweryId).order("name")),
});

// Vendors with their contracts nested, each contract carrying the four
// drawdown numbers from contract_balances (committed, received, on order,
// available) so Contracts and Contract read the same figures.
defineQuery({
  name: "list_vendors_and_contracts", description: "Vendors, alphabetical, with typed and observed lead time and each one's contracts and their drawdown (committed, received, on order, available)",
  input: z.object({}), roles: [...PURCHASING],
  handler: async (ctx) => {
    const [vendors, contracts, balances, observed] = await Promise.all([
      unwrap(ctx.db.from("vendors").select("id, name, email, phone, payment_terms, lead_time_days, active").eq("brewery_id", ctx.breweryId).order("name")),
      unwrap(ctx.db.from("material_contracts").select("id, vendor_id, material_id, contract_no, unit_cost_cents, starts_on, ends_on, materials(name)").eq("brewery_id", ctx.breweryId).order("created_at")),
      unwrap(ctx.db.from("contract_balances").select("contract_id, qty_committed, qty_received, qty_on_order, qty_available").eq("brewery_id", ctx.breweryId)),
      unwrap(ctx.db.from("vendor_lead_times").select("vendor_id, sent_via, n, avg_lead_days, avg_first_lead_days, avg_late_days").eq("brewery_id", ctx.breweryId)),
    ]);
    const balance = new Map((balances ?? []).map((b) => [b.contract_id as string, b]));
    const observedBy = Map.groupBy(observed ?? [], (o) => o.vendor_id as string);
    const contractsBy = Map.groupBy(contracts ?? [], (c) => c.vendor_id as string);
    return (vendors ?? []).map((v) => ({
      ...v,
      // Observed, never stored: n says how weak the evidence is ("14 days (n=3)").
      observed: (observedBy.get(v.id as string) ?? []).map((o) => ({
        sent_via: o.sent_via as string, n: o.n as number, avg_lead_days: Number(o.avg_lead_days),
        avg_first_lead_days: Number(o.avg_first_lead_days),
        avg_late_days: o.avg_late_days == null ? null : Number(o.avg_late_days),   // no promise on record is not "on time"
      })),
      contracts: (contractsBy.get(v.id as string) ?? []).map(({ materials, ...c }) => {
        const b = balance.get(c.id as string);
        return {
          ...c, material_name: (materials as unknown as { name: string } | null)?.name ?? null,
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
  unitCostCents: cents.optional(),
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

const receiptCountLine = z.object({
  poLineId: z.string().uuid(), qtyCounted: z.number().nonnegative(),
  lotCode: z.string().trim().optional(), bestBy: isoDate.optional(),
});

defineCommand({
  name: "correct_purchase_receipt",
  description: "Correct an unused purchase receipt with a reason: preserve the original facts, reverse its exact movements, and append replacement counts and lot facts atomically",
  input: z.object({ receiptId: z.string().uuid(), reason: z.string().trim().min(1), lines: z.array(receiptCountLine).min(1) }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("correct_purchase_receipt", {
    p_brewery: ctx.breweryId, p_receipt: i.receiptId, p_reason: i.reason,
    p_lines: i.lines.map(l => ({ po_line_id: l.poLineId, qty_counted: l.qtyCounted, lot_code: l.lotCode ?? null, best_by: l.bestBy ?? null })),
    p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "receive_purchase_order",
  description: "Count what arrived against a sent purchase order at one bin: receipt, lines (over or short both allowed), lots read off the package, and receipt movements in one write; status derives from the counts",
  input: z.object({
    poId: z.string().uuid(), locationId: z.string().uuid(), binId: z.string().uuid(), receivedOn: isoDate.optional(),
    lines: z.array(receiptCountLine).min(1),
  }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("receive_purchase_order", {
    p_brewery: ctx.breweryId, p_po: i.poId, p_location: i.locationId, p_bin: i.binId, p_received_on: i.receivedOn ?? null,
    p_lines: i.lines.map((l) => ({ po_line_id: l.poLineId, qty_counted: l.qtyCounted, lot_code: l.lotCode ?? null, best_by: l.bestBy ?? null })),
    p_request_id: execution.requestId,
  })),
});

const PO_COLUMNS = "id, po_no, vendor_id, status, ordered_on, expected_on, sent_via, sent_by, note, created_at";
const OPEN_STATUSES = ["draft", "sent", "partially_received"] as const;

defineQuery({
  name: "list_purchase_orders", description: "Open purchase orders (draft, sent, partially received) with vendor and what each still owes; includeClosed adds received and cancelled",
  input: z.object({ includeClosed: z.boolean().optional() }), roles: [...PO_ROLES],
  handler: async (ctx, i) => {
    let q = ctx.db.from("purchase_orders").select(`${PO_COLUMNS}, vendors(name)`).eq("brewery_id", ctx.breweryId).order("created_at", { ascending: false });
    if (!i.includeClosed) q = q.in("status", OPEN_STATUSES);
    const [pos, open] = await Promise.all([
      unwrap(q),
      unwrap(ctx.db.from("po_open_balances").select("po_id").eq("brewery_id", ctx.breweryId).gt("qty_open", 0)),
    ]);
    const linesOpen = Map.groupBy(open ?? [], (o) => o.po_id as string);
    return (pos ?? []).map(({ vendors, ...po }) => ({
      ...po, vendor_name: (vendors as unknown as { name: string } | null)?.name ?? null,
      lines_open: linesOpen.get(po.id as string)?.length ?? 0,
    }));
  },
});

// Lines carry ordered / received / open from po_open_balances (derived, never
// stored) plus the material's name, units and lot tracking, so Receive PO
// knows which lines ask for a lot; receipts list what has posted so far.
defineQuery({
  name: "get_purchase_order", description: "One purchase order with vendor, lines (ordered, received so far, still open), and its receipts",
  input: z.object({ poId: z.string().uuid(), correctionReceiptId: z.string().uuid().optional() }), roles: [...PO_ROLES],
  handler: async (ctx, i) => {
    const [po, lines, balances, receipts] = await Promise.all([
      unwrap(ctx.db.from("purchase_orders").select(`${PO_COLUMNS}, vendors(name, email)`).eq("brewery_id", ctx.breweryId).eq("id", i.poId).maybeSingle()),
      unwrap(ctx.db.from("purchase_order_lines").select("id, material_id, qty_ordered, unit_cost_cents, contract_id, expected_lot_code, materials(name, purchase_uom, purchase_uom_factor, base_uom, lot_tracked)").eq("brewery_id", ctx.breweryId).eq("po_id", i.poId)),
      unwrap(ctx.db.from("po_open_balances").select("po_line_id, qty_received, qty_open").eq("po_id", i.poId)),
      unwrap(ctx.db.from("receipts").select("id, received_on, received_by, note, corrects_receipt_id, correction_reason, location_id, bin_id, receipt_lines(po_line_id, qty_expected, qty_counted, variance, lot_id, material_id, material_name, base_uom, purchase_uom, purchase_uom_factor, lot_code, lot_received_on, lot_best_by)").eq("po_id", i.poId).order("received_on")),
    ]);
    if (!po) throw new CommandError("purchase order not found", 404, "not_found");
    const balance = new Map((balances ?? []).map((b) => [b.po_line_id as string, b]));
    const { vendors, ...header } = po;
    const lineById = new Map((lines ?? []).map(line => [line.id as string, line]));
    const correctedBy = new Map((receipts ?? []).filter(r => r.corrects_receipt_id).map(r => [r.corrects_receipt_id as string, r.id as string]));
    const correction = i.correctionReceiptId ? receipts?.find(receipt => receipt.id === i.correctionReceiptId) : null;
    if (i.correctionReceiptId && !correction) throw new CommandError("receipt not found", 404, "not_found");
    return {
      ...header, vendor: vendors as unknown as { name: string; email: string | null } | null,
      lines: (lines ?? []).map(({ materials, ...l }) => ({
        ...l, qty_ordered: Number(l.qty_ordered), material: materials as unknown as { name: string; purchase_uom: string; purchase_uom_factor: number; base_uom: string; lot_tracked: boolean } | null,
        qty_received: Number(balance.get(l.id as string)?.qty_received ?? 0), qty_open: Number(balance.get(l.id as string)?.qty_open ?? l.qty_ordered),
      })),
      correction_receipt: correction ?? null,
      correction_lines: correction?.receipt_lines.map(count => {
        const line = lineById.get(count.po_line_id);
        const received = Number(balance.get(count.po_line_id)?.qty_received ?? 0);
        return { ...line, qty_counted: Number(count.qty_counted), recorded_best_by: count.lot_best_by,
          // Open before this receipt: its own count is added back.
          qty_received: received, qty_open: Math.max(Number(line?.qty_ordered ?? 0) - (received - Number(count.qty_counted)), 0),
          expected_lot_code: count.lot_code,
          material: { name: count.material_name ?? "Original material name not captured", purchase_uom: count.purchase_uom ?? "purchase units",
            purchase_uom_factor: count.purchase_uom_factor, base_uom: count.base_uom, lot_tracked: Boolean(line?.materials?.lot_tracked) },
        };
      }) ?? [],
      receipts: (receipts ?? []).map(receipt => ({ ...receipt, corrected_by_receipt_id: correctedBy.get(receipt.id) ?? null })),
    };
  },
});

// Planning's material gaps: the material_requirements view (demand, supply,
// gap, needed-by, buy-by and whether it is already out of reach, resolved
// vendor and contract, names, and the vendor's typed lead time).
defineQuery({
  name: "get_material_requirements",
  description: "Material gaps for Planning: required, on hand, on order, short (base units), whole purchase units short, needed-by and buy-by dates, and the vendor and contract each gap resolves to; a null vendor or an out-of-reach buy-by cannot draft",
  input: z.object({ shortOnly: z.boolean().optional().describe("Keep only materials with something short (short > 0)") }), roles: [...PURCHASING],
  handler: async (ctx, i) => {
    let q = ctx.db.from("material_requirements")
      .select("material_id, material_name, base_uom, purchase_uom, required, on_hand, on_order, short, needed_by, buy_by, out_of_reach, purchase_units_short, vendor_id, vendor_name, lead_time_days, contract_id")
      .eq("brewery_id", ctx.breweryId).order("needed_by").order("material_name");
    if (i.shortOnly) q = q.gt("short", 0);
    const rows = await unwrap(q);
    return (rows ?? []).map((r) => ({
      ...r, required: Number(r.required), on_hand: Number(r.on_hand), on_order: Number(r.on_order), short: Number(r.short),
      purchase_units_short: Number(r.purchase_units_short),
    }));
  },
});

defineCommand({
  name: "draft_purchase_order_from_requirements",
  description: "Draft one purchase order per vendor for the chosen material gaps, quantities rounded up to whole purchase units, contract price up to the available commitment; materials with no vendor or past their buy-by are skipped and named with the reason",
  input: z.object({ materialIds: z.array(z.string().uuid()).min(1) }),
  roles: [...PO_ROLES],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("draft_purchase_order_from_requirements", {
    p_brewery: ctx.breweryId, p_materials: i.materialIds, p_request_id: execution.requestId,
  })),
});

const materialCountInput = z.object({
  locationId: z.string().uuid(), binId: z.string().uuid(),
  lines: z.array(z.object({ materialId: z.string().uuid(), qty: z.number().nonnegative() })).min(1),
});

defineQuery({
  name: "get_material_count_preview", description: "Preview exact base-unit lot adjustments and the stock revision required to record a material count",
  input: materialCountInput, roles: [...PURCHASING],
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_material_count_preview", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_bin: i.binId,
    p_lines: i.lines.map(line => ({ material_id: line.materialId, qty: line.qty })),
  })),
});

defineCommand({
  name: "record_material_count",
  description: "Record the previewed material count at one bin; reject changed stock and post exactly the reviewed lot adjustments",
  input: materialCountInput.extend({ countedOn: isoDate.optional(), revision: z.string().min(1).optional().describe("Preview revision; omitted only to replay a completed legacy request") }),
  roles: [...PURCHASING],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("record_material_count", {
    p_brewery: ctx.breweryId, p_location: i.locationId, p_bin: i.binId, p_counted_on: i.countedOn ?? null,
    p_lines: i.lines.map((l) => ({ material_id: l.materialId, qty: l.qty })), p_request_id: execution.requestId, p_revision: i.revision,
  })),
});
