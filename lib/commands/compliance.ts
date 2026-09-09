// lib/commands/compliance.ts — compliance (Program 9). The registry holds
// COLA/formula approvals and state registrations per brand and the brewery's
// state licenses. A period report is generated from the movement ledger on
// demand and filed as an immutable jsonb snapshot; MGR never transmits a
// filing. trace_lot follows a finished-goods lot back to its batch and through
// every ledger movement that names it.
import { z } from "zod";
import { isoDate } from "./packaging";
import { breweryToday, defineCommand, defineQuery, rows, stateCode, unwrap } from "./registry";

const ROLES = ["admin", "sales"] as const;
const day = isoDate.optional();

defineCommand({
  name: "upsert_brand_approval", description: "Record or edit one brand's COLA or formula approval by its TTB id; the same id on the same brand is one record",
  roles: [...ROLES],
  input: z.object({ id: z.string().uuid().optional(), brandId: z.string().uuid(), kind: z.enum(["cola", "formula"]), ttbId: z.string().min(1), approvedOn: day, expiresOn: day, note: z.string().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_brand_approval", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_brand: i.brandId, p_kind: i.kind, p_ttb_id: i.ttbId,
    p_approved_on: i.approvedOn ?? null, p_expires_on: i.expiresOn ?? null, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_state_registration", description: "Record or replace a brand's permission to sell in one state",
  roles: [...ROLES],
  input: z.object({ brandId: z.string().uuid(), state: stateCode, registrationNo: z.string().optional(), approvedOn: day, expiresOn: day }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_state_registration", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_state: i.state, p_registration_no: i.registrationNo ?? null,
    p_approved_on: i.approvedOn ?? null, p_expires_on: i.expiresOn ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_brewery_state_license", description: "Record or replace one of the brewery's state licenses by state and kind (kind is stored lower-case and trimmed)",
  roles: [...ROLES],
  input: z.object({ state: stateCode, kind: z.string().trim().min(1), licenseNo: z.string().optional(), expiresOn: day, note: z.string().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_brewery_state_license", {
    p_brewery: ctx.breweryId, p_state: i.state, p_kind: i.kind, p_license_no: i.licenseNo ?? null,
    p_expires_on: i.expiresOn ?? null, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

export type Approval = { id: string; brand_id: string; kind: "cola" | "formula"; ttb_id: string; approved_on: string | null; expires_on: string | null; note: string | null };
export type Registration = { id: string; brand_id: string; state: string; registration_no: string | null; approved_on: string | null; expires_on: string | null };
export type License = { id: string; state: string; kind: string; license_no: string | null; expires_on: string | null; note: string | null };
export type RegistryBrand = { id: string; name: string; approvals: Approval[]; registrations: Registration[] };

defineQuery({
  name: "get_compliance_registry", description: "Every brand with its approvals and state registrations, and the brewery's state licenses",
  roles: [...ROLES],
  input: z.object({}),
  handler: async (ctx) => {
    const [brands, approvals, registrations, licenses] = await Promise.all([
      rows<{ id: string; name: string }>(ctx.db.from("brands").select("id, name").eq("brewery_id", ctx.breweryId).order("name")),
      rows<Approval>(ctx.db.from("brand_approvals").select("*").eq("brewery_id", ctx.breweryId).order("kind")),
      rows<Registration>(ctx.db.from("state_registrations").select("*").eq("brewery_id", ctx.breweryId).order("state")),
      rows<License>(ctx.db.from("brewery_state_licenses").select("*").eq("brewery_id", ctx.breweryId).order("state").order("kind")),
    ]);
    return {
      brands: brands.map((b): RegistryBrand => ({ ...b, approvals: approvals.filter((a) => a.brand_id === b.id), registrations: registrations.filter((r) => r.brand_id === b.id) })),
      licenses,
    };
  },
});

export type ReportLine = { class: "keg" | "can" | "bottle"; begin: number; in: number; out: number; end: number };
export type Report = {
  figures: { jurisdiction: string; periodStart: string; periodEnd: string; lines: ReportLine[]; removals: Record<string, number>; cellarRemovals: Record<string, number>; byState: Record<string, number>; packaged: number; inProcess: number; balances: boolean };
  warnings: string[];
  externalMappingRequired: string[];
};

const period = z.object({ jurisdiction: z.string().regex(/^[A-Z-]+$/, "TTB or US-XX"), periodStart: isoDate, periodEnd: isoDate });

const positiveBblText = z.string()
  .regex(/^(?:\d+(?:\.\d{0,8})?|\.\d{1,8})$/, "positive decimal BBL with at most eight fractional digits")
  .refine((value) => /[1-9]/.test(value), "BBL must be positive");
const positiveBblNumber = z.number().finite().positive()
  .refine((value) => {
    const [coefficient, exponentText] = String(value).toLowerCase().split("e");
    const fractionDigits = coefficient.split(".")[1]?.length ?? 0;
    return Math.max(0, fractionDigits - Number(exponentText ?? 0)) <= 8;
  }, "BBL must have at most eight fractional digits");
const exactPositiveBbl = z.union([positiveBblText, positiveBblNumber]);

defineQuery({
  name: "generate_compliance_report", description: "Compute a period report from finished-goods and cellar ledgers: package-class balances, one additive removal total, an explanatory cellar breakdown, packaged volume, and beer in process; nothing is stored",
  roles: [...ROLES], input: period,
  handler: (ctx, i) => unwrap(ctx.db.rpc("generate_compliance_report", { p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd })) as Promise<Report>,
});

export type LossAllocation = {
  id: string; bbl: string; classification: "sample" | "taproom" | "destruction";
  destination_state: string | null; tax_treatment: string | null; created_at: string; created_by: string;
};
export type LossReview = {
  adjustment_id: string; batch_id: string; batch_no: number; closed_at: string;
  original_bbl: string; remaining_bbl: string; allocations: LossAllocation[];
};

defineQuery({
  name: "get_loss_review",
  description: "List completion reconciliation losses in a period with exact original, allocated, and remaining BBL",
  roles: [...ROLES],
  input: z.object({ periodStart: isoDate, periodEnd: isoDate }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_loss_review", {
    p_brewery: ctx.breweryId, p_start: i.periodStart, p_end: i.periodEnd,
  })) as Promise<LossReview[]>,
});

defineCommand({
  name: "reattribute_loss",
  description: "Allocate part of a completion reconciliation loss to samples, direct cellar Taproom removals, or destruction while preserving the original and exact total; Sample requires a destination state",
  roles: [...ROLES],
  input: z.object({
    adjustmentId: z.string().uuid(),
    bbl: exactPositiveBbl,
    classification: z.enum(["sample", "taproom", "destruction"]),
    destinationState: stateCode.optional(),
  })
    .refine((input) => input.classification !== "sample" || Boolean(input.destinationState), {
      path: ["destinationState"], message: "Sample requires a destination state",
    })
    .refine((input) => input.classification === "sample" || !input.destinationState, {
      path: ["destinationState"], message: "Destination state is only valid for Sample",
    }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("reattribute_loss", {
    p_brewery: ctx.breweryId, p_adjustment: i.adjustmentId, p_bbl: typeof i.bbl === "number" ? String(i.bbl) : i.bbl,
    p_classification: i.classification, p_destination_state: i.destinationState ?? null,
    p_request_id: execution.requestId,
  })),
});

export type Filing = { id: string; jurisdiction: string; period_start: string; period_end: string; figures: Report["figures"]; filed_at: string | null; filed_by: string | null; note: string | null; created_at: string };

defineCommand({
  name: "file_compliance_report", description: "Generate and save an immutable filed snapshot; refused for imbalance, an overlapping filing, or direct cellar Taproom volume without an approved external mapping. MGR does not transmit the filing",
  roles: [...ROLES], input: period.extend({ note: z.string().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("file_compliance_report", {
    p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_compliance_reports", description: "Filed snapshots, newest period first, optionally one jurisdiction and period, plus the brewery's today for the month list",
  roles: [...ROLES], input: period.partial(),
  handler: async (ctx, i) => {
    let q = ctx.db.from("report_filings").select("*").eq("brewery_id", ctx.breweryId).order("period_start", { ascending: false }).order("jurisdiction");
    if (i.jurisdiction) q = q.eq("jurisdiction", i.jurisdiction);
    if (i.periodStart) q = q.eq("period_start", i.periodStart);
    if (i.periodEnd) q = q.eq("period_end", i.periodEnd);
    const [filings, today] = await Promise.all([rows<Filing>(q), breweryToday(ctx)]);
    return { filings, today };
  },
});

export type LotRowOut = { id: string; code: string; packaged_on: string; brands: { name: string } | null };

defineQuery({
  name: "list_lots", description: "Finished-goods lots, newest packaged first, as the entry to a lot trace",
  roles: [...ROLES], input: z.object({}),
  handler: (ctx) => rows<LotRowOut>(ctx.db.from("lots").select("id, code, packaged_on, brands(name)").eq("brewery_id", ctx.breweryId).order("packaged_on", { ascending: false }).limit(50)),
});

type LotRow = {
  id: string; code: string; packaged_on: string; best_by: string | null; brands: { name: string } | null;
  packaging_runs: { id: string; run_no: number | null; bbl_drawn: number | null; vessel_occupancies: { vessels: { name: string } | null; batches: { id: string; batch_no: number | null; brewed_on: string | null } | null } | null } | null;
};
type LotMovement = { id: string; type: string; qty: number; bbl: number; sku_id: string; bin_id: string; ref: string | null; source_movement_id: string | null; created_at: string; skus: { name: string } | null; bins: { name: string } | null; locations: { name: string } | null };

defineQuery({
  name: "trace_lot", description: "One finished-goods lot: its packaging run, the tank and batch it came from, every ledger movement that names the lot, and the units still on hand",
  roles: [...ROLES],
  input: z.object({ lotId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const lot = await unwrap(ctx.db.from("lots")
      .select("id, code, packaged_on, best_by, brands(name), packaging_runs(id, run_no, bbl_drawn, vessel_occupancies(vessels(name), batches(id, batch_no, brewed_on)))")
      .eq("id", i.lotId).eq("brewery_id", ctx.breweryId).single()) as unknown as LotRow;
    const movements: LotMovement[] = [];
    for (let start = 0; ; start += 500) {
      const result = await ctx.db.from("inventory_movements").select("id,type,qty,bbl,sku_id,bin_id,ref,source_movement_id,created_at,skus(name),bins(name),locations(name)", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("lot_id", i.lotId).order("created_at").order("id").range(start, start + 499);
      const page = await unwrap(Promise.resolve(result)) as unknown as LotMovement[];
      movements.push(...page);
      if (result.count === null || (!page.length && movements.length < result.count)) throw new Error("Could not read complete lot trace");
      if (movements.length >= result.count) break;
    }
    const orderIds = [...new Set(movements.filter(m => m.type === "sale_removal" && m.ref).map(m => m.ref!))];
    const recipients = [];
    // Small batches keep URL size bounded; each unique order has one shipment.
    for (let start = 0; start < orderIds.length; start += 100) {
      const orders = await unwrap(ctx.db.from("orders").select("id,order_no,customers(id,name),ship_tos(id,label,address1,address2,city,state,zip),shipments(id,carrier,tracking,invoices(id,invoice_no))")
        .eq("brewery_id", ctx.breweryId).in("id", orderIds.slice(start, start + 100)));
      recipients.push(...(orders ?? []));
    }
    const run = lot.packaging_runs;
    const occ = run?.vessel_occupancies;
    const moves = movements.map((m) => ({ id: m.id, type: m.type, qty: Number(m.qty), bbl: Number(m.bbl), sku_id: m.sku_id, bin_id: m.bin_id, bin: m.bins?.name ?? "", ref: m.ref, source_movement_id: m.source_movement_id, created_at: m.created_at, sku: m.skus?.name ?? "", location: m.locations?.name ?? "" }));
    const balances = new Map<string, { sku_id: string; sku: string; bin_id: string; bin: string; location: string; qty: number; bbl: number }>();
    for (const m of moves) {
      const key = `${m.sku_id}:${m.bin_id}`;
      const b = balances.get(key) ?? { sku_id: m.sku_id, sku: m.sku, bin_id: m.bin_id, bin: m.bin, location: m.location, qty: 0, bbl: 0 };
      b.qty += m.qty; b.bbl += m.bbl; balances.set(key, b);
    }
    return {
      lot: { id: lot.id, code: lot.code, brand: lot.brands?.name ?? "", packaged_on: lot.packaged_on, best_by: lot.best_by },
      run: run ? { id: run.id, run_no: run.run_no, bbl_drawn: run.bbl_drawn, vessel: occ?.vessels?.name ?? "" } : null,
      batch: occ?.batches ?? null,
      movements: moves,
      balances: [...balances.values()], on_hand_bbl: moves.reduce((n, m) => n + m.bbl, 0), recipients,
      // Compatibility only when all units are the same SKU; never sum package units.
      on_hand: new Set(moves.map(m => m.sku_id)).size <= 1 ? moves.reduce((n, m) => n + m.qty, 0) : null,
      warning: "Only recorded lot identities are traced. Historical untracked stock and consumption cannot be assigned to this lot.",
    };
  },
});
