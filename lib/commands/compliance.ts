// lib/commands/compliance.ts — compliance (Program 9). The registry holds
// COLA/formula approvals and state registrations per brand and the brewery's
// state licenses; the order screens warn from it and never block. A period
// report is generated from the movement ledger on demand and filed as an
// immutable jsonb snapshot; MGR never transmits a filing.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap } from "./registry";

const ROLES = ["admin", "sales"] as const;
const rows = <T,>(q: Parameters<typeof unwrap>[0]) => unwrap(q) as unknown as Promise<T[]>;

const state = z.string().regex(/^[A-Z]{2}$/, "two-letter state code");
const day = z.string().date().optional();

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
  input: z.object({ brandId: z.string().uuid(), state, registrationNo: z.string().optional(), approvedOn: day, expiresOn: day }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_state_registration", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_state: i.state, p_registration_no: i.registrationNo ?? null,
    p_approved_on: i.approvedOn ?? null, p_expires_on: i.expiresOn ?? null, p_request_id: execution.requestId,
  })),
});

defineCommand({
  name: "upsert_brewery_state_license", description: "Record or replace one of the brewery's state licenses by state and kind",
  roles: [...ROLES],
  input: z.object({ state, kind: z.string().min(1), licenseNo: z.string().optional(), expiresOn: day, note: z.string().optional() }),
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
  figures: { jurisdiction: string; periodStart: string; periodEnd: string; lines: ReportLine[]; removals: Record<string, number>; byState: Record<string, number>; packaged: number; inProcess: number; balances: boolean };
  warnings: string[];
};

const period = z.object({ jurisdiction: z.string().regex(/^[A-Z-]+$/, "TTB or US-XX"), periodStart: z.string().date(), periodEnd: z.string().date() });

defineQuery({
  name: "generate_compliance_report", description: "Compute a period report from the movement ledger: per package class begin + in − out = end in bbl, removals by frozen tax treatment and destination state, packaged volume, and beer in process; nothing is stored",
  roles: [...ROLES], input: period,
  handler: (ctx, i) => unwrap(ctx.db.rpc("generate_compliance_report", { p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd })) as Promise<Report>,
});

export type Filing = { id: string; jurisdiction: string; period_start: string; period_end: string; figures: Report["figures"]; filed_at: string | null; filed_by: string | null; note: string | null; created_at: string };

defineCommand({
  name: "file_compliance_report", description: "Generate the period report and save it as the immutable filed snapshot; refused when the report does not balance or the period is already filed. MGR does not transmit the filing",
  roles: [...ROLES], input: period.extend({ note: z.string().optional() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("file_compliance_report", {
    p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_compliance_reports", description: "Every filed snapshot, newest period first, and the brewery's today for the month list",
  roles: [...ROLES], input: z.object({}),
  handler: async (ctx) => {
    const [filings, brewery] = await Promise.all([
      rows<Filing>(ctx.db.from("report_filings").select("*").eq("brewery_id", ctx.breweryId).order("period_start", { ascending: false }).order("jurisdiction")),
      unwrap(ctx.db.from("breweries").select("timezone").eq("id", ctx.breweryId).single()) as Promise<{ timezone: string }>,
    ]);
    return { filings, today: new Date().toLocaleDateString("en-CA", { timeZone: brewery.timezone }) };
  },
});

type LotRow = {
  id: string; code: string; packaged_on: string; best_by: string | null; brands: { name: string } | null;
  packaging_runs: { id: string; run_no: number | null; bbl_drawn: number | null; closed_at: string | null; vessel_occupancies: { vessels: { name: string } | null; batches: { id: string; batch_no: number | null; brewed_on: string | null; planned_on: string } | null } | null } | null;
};
type LotMovement = { id: string; type: string; qty: number; ref: string | null; created_at: string; skus: { name: string } | null; locations: { name: string } | null };

defineQuery({
  name: "trace_lot", description: "One finished-goods lot: its packaging run, the tank and batch it came from, and every ledger movement that names the lot",
  roles: [...ROLES, "warehouse", "brewer"],
  input: z.object({ lotId: z.string().uuid() }),
  handler: async (ctx, i) => {
    const lot = await unwrap(ctx.db.from("lots")
      .select("id, code, packaged_on, best_by, brands(name), packaging_runs(id, run_no, bbl_drawn, closed_at, vessel_occupancies(vessels(name), batches(id, batch_no, brewed_on, planned_on)))")
      .eq("id", i.lotId).eq("brewery_id", ctx.breweryId).single()) as unknown as LotRow;
    // ponytail: ship_order records no lot on its sale removals, so a shipment
    // appears here only once pick/ship takes a lot per line (DRIFT "pick/ship
    // lots"); until then recall contacts cannot be derived from the ledger.
    const movements = await rows<LotMovement>(ctx.db.from("inventory_movements").select("id, type, qty, ref, created_at, skus(name), locations(name)")
      .eq("lot_id", i.lotId).order("created_at"));
    const run = lot.packaging_runs;
    const occ = run?.vessel_occupancies;
    return {
      lot: { id: lot.id, code: lot.code, brand: lot.brands?.name ?? "", packaged_on: lot.packaged_on, best_by: lot.best_by },
      run: run ? { id: run.id, run_no: run.run_no, bbl_drawn: run.bbl_drawn, closed_at: run.closed_at, vessel: occ?.vessels?.name ?? "" } : null,
      batch: occ?.batches ?? null,
      movements: movements.map((m) => ({ id: m.id, type: m.type, qty: Number(m.qty), ref: m.ref, created_at: m.created_at, sku: m.skus?.name ?? "", location: m.locations?.name ?? "" })),
    };
  },
});

export type LotRowOut = { id: string; code: string; packaged_on: string; brands: { name: string } | null };

defineQuery({
  name: "list_lots", description: "Finished-goods lots, newest packaged first, as the entry to a lot trace",
  roles: [...ROLES, "warehouse", "brewer"], input: z.object({}),
  handler: (ctx) => rows<LotRowOut>(ctx.db.from("lots").select("id, code, packaged_on, brands(name)").eq("brewery_id", ctx.breweryId).order("packaged_on", { ascending: false }).limit(50)),
});
