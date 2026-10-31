// lib/commands/compliance.ts — compliance (Program 9). The registry holds
// COLA/formula approvals and state registrations per brand and the brewery's
// state licenses. A period report is generated from the movement ledger on
// demand and filed as an immutable jsonb snapshot; MGR never transmits a
// filing. trace_lot follows a finished-goods lot back through recorded blend
// membership and every ledger movement that names it. search_colas looks up
// the brewery's label approvals on TTB's public COLA registry by its TTB
// registry number (lib/ttb/colas.ts), on demand and never stored.
import { z } from "zod";
import { periodKey, periodRange, recentPeriods, type Cadence } from "@/lib/compliance-period";
import type { LotTraceSources } from "@/lib/mgr/lot-trace-view";
import { recipientsFor } from "./recall-recipients";
import type { MaterialLotTraceSnapshot } from "@/lib/mgr/material-lot-trace-view";
import { isoDate } from "./packaging";
import { getColaDetails, getColaImage, isColaImageUrl, matchColas, searchColasByPermit } from "@/lib/ttb/colas";
import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import { breweryToday, CommandError, completeRows, defineCommand, defineQuery, PAGE_SIZE, rows, STAFF_ROLES, stateCode, unwrap } from "./registry";
import type { Ctx } from "./registry";
import { requireAdmission } from "./admission";
import { escapeRegex } from "@/lib/escape-regex";
import { movementReferences } from "./inventory";

const ROLES = ["admin", "sales"] as const;
// The three registry upserts below keep a saved value when the caller omits
// its field and clear it when the caller sends null (#522); the RPC takes the
// cleared column names in p_clear.
const day = isoDate.nullable().optional();
const text = z.string().nullable().optional();
const cleared = (fields: Record<string, unknown>) => Object.keys(fields).filter((column) => fields[column] === null);

defineCommand({
  name: "upsert_brand_approval", description: "Record or edit one brand's COLA or formula approval: ttbId is a COLA's TTB-assigned ID or a formula's number, and serialNumber is a COLA's own applicant serial (a formula takes none); imageUrl selects an official TTB label attachment and requires an approved COLA date; the same kind and ttbId on the same brand is one record; an edit keeps a field left out and clears one sent as null; changing kind or TTB ID clears an omitted image",
  roles: [...ROLES],
  // Both identifiers are text: a TTB ID or serial may carry leading zeros.
  input: z.object({ id: z.string().uuid().optional(), brandId: z.string().uuid(), kind: z.enum(["cola", "formula"]), ttbId: z.string().min(1), serialNumber: text, approvedOn: day, expiresOn: day, note: text, imageUrl: z.string().refine(isColaImageUrl, "Select an official TTB label image").nullable().optional() })
    .refine((i) => i.kind === "cola" || i.serialNumber == null, { path: ["serialNumber"], message: "Only a COLA has an applicant serial number" })
    .refine((i) => i.imageUrl == null || (i.kind === "cola" && i.approvedOn != null), { path: ["imageUrl"], message: "A selected label image requires an approved COLA with its approval date" }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_brand_approval", {
    p_brewery: ctx.breweryId, p_id: i.id ?? null, p_brand: i.brandId, p_kind: i.kind, p_ttb_id: i.ttbId, p_serial_number: i.serialNumber ?? null,
    p_approved_on: i.approvedOn ?? null, p_expires_on: i.expiresOn ?? null, p_note: i.note ?? null, p_image_url: i.imageUrl ?? null, p_request_id: execution.requestId,
    p_clear: cleared({ serial_number: i.serialNumber, approved_on: i.approvedOn, expires_on: i.expiresOn, note: i.note, image_url: i.imageUrl }),
  })),
});

defineCommand({
  name: "upsert_state_registration", description: "Record or edit a brand's permission to sell in one state; an edit keeps a field left out and clears one sent as null",
  roles: [...ROLES],
  input: z.object({ brandId: z.string().uuid(), state: stateCode, registrationNo: text, approvedOn: day, expiresOn: day }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_state_registration", {
    p_brewery: ctx.breweryId, p_brand: i.brandId, p_state: i.state, p_registration_no: i.registrationNo ?? null,
    p_approved_on: i.approvedOn ?? null, p_expires_on: i.expiresOn ?? null, p_request_id: execution.requestId,
    p_clear: cleared({ registration_no: i.registrationNo, approved_on: i.approvedOn, expires_on: i.expiresOn }),
  })),
});

defineCommand({
  name: "upsert_brewery_state_license", description: "Record or edit one of the brewery's state licenses by state and kind (kind is stored lower-case and trimmed); an edit keeps a field left out and clears one sent as null",
  roles: [...ROLES],
  input: z.object({ state: stateCode, kind: z.string().trim().min(1), licenseNo: text, expiresOn: day, note: text }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("upsert_brewery_state_license", {
    p_brewery: ctx.breweryId, p_state: i.state, p_kind: i.kind, p_license_no: i.licenseNo ?? null,
    p_expires_on: i.expiresOn ?? null, p_note: i.note ?? null, p_request_id: execution.requestId,
    p_clear: cleared({ license_no: i.licenseNo, expires_on: i.expiresOn, note: i.note }),
  })),
});

defineCommand({
  name: "delete_brewery_state_license", description: "Delete a brewery state license",
  roles: [...ROLES],
  input: z.object({ licenseId: z.string().uuid() }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("delete_brewery_state_license", {
    p_brewery: ctx.breweryId, p_id: i.licenseId, p_request_id: execution.requestId,
  })),
});

export type Approval = { id: string; brand_id: string; kind: "cola" | "formula"; ttb_id: string; serial_number: string | null; approved_on: string | null; expires_on: string | null; note: string | null; image_url?: string | null };
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

export type ColaSearch = { permit: string; rows: ColaRecord[] };

defineQuery({
  name: "search_colas", description: "Search TTB's public COLA registry for the label approvals under the brewery's TTB registry number, completed in the last 15 years, newest first; name keeps only rows whose fanciful or brand name contains it (ignoring case); refused when the brewery has no registry number; nothing is stored",
  roles: [...ROLES],
  input: z.object({ name: z.string().optional() }),
  handler: async (ctx, i): Promise<ColaSearch> => {
    const brewery = await unwrap(ctx.db.from("breweries").select("ttb_registry_no").eq("id", ctx.breweryId).single());
    const permit = brewery?.ttb_registry_no?.trim();
    if (!permit) throw new CommandError("Set the brewery's TTB registry number on Settings to search COLAs.", 400, "bad_request");
    // A TTB failure is an error, never an empty list: no match and no answer differ.
    const found = await searchColasByPermit(permit).catch((error: unknown) => {
      throw new CommandError(`TTB's COLA registry did not answer: ${error instanceof Error ? error.message : String(error)}`, 502, "upstream_unavailable");
    });
    return { permit, rows: matchColas(found, i.name) };
  },
});

const colaId = z.string().regex(/^\d{14}$/, "A TTB ID has exactly 14 digits");

async function colaPermit(ctx: Ctx): Promise<string> {
  const brewery = await unwrap(ctx.db.from("breweries").select("ttb_registry_no").eq("id", ctx.breweryId).single());
  const permit = brewery?.ttb_registry_no?.trim();
  if (!permit) throw new CommandError("Set the brewery's TTB registry number on Settings to retrieve COLA labels.", 400, "bad_request");
  return permit;
}

function colaUpstreamError(error: unknown): never {
  throw new CommandError(`Could not retrieve this COLA from TTB: ${error instanceof Error ? error.message : String(error)}`, 502, "upstream_unavailable");
}

defineQuery({
  name: "get_cola_details",
  description: "Retrieve an approved COLA's label image identifiers from TTB; refused unless its principal permit matches the brewery's TTB registry number; images render through get_cola_image",
  roles: [...ROLES],
  input: z.object({ ttbId: colaId }),
  handler: async (ctx, i): Promise<ColaDetails> => {
    const permit = await colaPermit(ctx);
    const details = await getColaDetails(i.ttbId).catch(colaUpstreamError);
    if (details.permit !== permit) throw new CommandError("This COLA does not belong to the brewery's TTB registry number.", 403, "permission_denied");
    if (details.status !== "APPROVED") throw new CommandError(`This COLA is ${details.status}, not APPROVED.`, 400, "bad_request");
    if (!details.approvedOn) throw new CommandError("TTB reports this COLA as approved but provides no approval date. Open the COLA on TTB to review it.", 502, "upstream_unavailable");
    return details;
  },
});

defineQuery({
  name: "get_cola_image",
  description: "Render one official approved COLA label as a bounded image data URL; a label saved on a brand is fetched from TTB once with a fresh session and served from MGR's copy afterwards; admin/sales may preview brewery-owned labels, other staff may view only an approved image saved on a brand",
  roles: STAFF_ROLES,
  input: z.object({ ttbId: colaId, url: z.string().refine(isColaImageUrl, "Use an official TTB label image URL") }),
  handler: async (ctx, i): Promise<{ dataUrl: string }> => {
    let permit: string;
    if (ctx.roles.some((role) => role === "admin" || role === "sales")) {
      permit = await colaPermit(ctx);
    } else {
      const savedPermit = await unwrap(ctx.db.rpc("get_saved_cola_image_permit", {
        p_brewery: ctx.breweryId, p_ttb_id: i.ttbId, p_image_url: i.url,
      }));
      permit = savedPermit?.trim() ?? "";
      if (!permit) throw new CommandError("Set the brewery's TTB registry number on Settings to retrieve COLA labels.", 400, "bad_request");
    }
    const label = { p_brewery: ctx.breweryId, p_ttb_id: i.ttbId, p_image_url: i.url };
    const stored = await unwrap(ctx.db.rpc("get_stored_cola_label_image", label));
    if (stored) return { dataUrl: stored };
    await requireAdmission(ctx.db);
    const image = await getColaImage(i.ttbId, i.url, permit).catch(colaUpstreamError);
    await (await import("@/lib/supabase/cola-label-images")).storeColaLabelImage(ctx.breweryId, i.ttbId, i.url, image.dataUrl);
    return image;
  },
});

export type ReportLine = { class: "keg" | "can" | "bottle"; begin: number; in: number; out: number; end: number };
export type StateTransaction = { state: string; kind: string; eventDate: string; sourceId: string; originalSourceId: string | null; volumeBbl: number; salesCents: number; sourceStatus: string };
/** Per-state sums of the facts; computed by destinationStateTotals, not returned by the report. */
export type StateTotal = { state: string; volumeBbl: number; outwardBbl: number; returnedBbl: number; adjustmentBbl: number; invoicedCents: number; creditedCents: number; salesCents: number };
export type Report = {
  figures: { stateTransactions?: StateTransaction[]; jurisdiction: string; periodStart: string; periodEnd: string; lines: ReportLine[]; removals: Record<string, number>; cellarRemovals: Record<string, number>; byState: Record<string, number>; packaged: number; inProcess: number; inProcessAsOf?: string; balances: boolean };
  warnings: string[];
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
  name: "generate_compliance_report", description: "Compute a period report from finished-goods and cellar ledgers (each finished-goods movement counts on its effective date, Packaged on for a packaging close): package-class balances, one additive removal total, an explanatory cellar breakdown, packaged volume, beer in process, and exact destination-state movement/invoice facts (per-state totals are sums of those facts); nothing is stored; refused for a period that starts before the books opened",
  roles: [...ROLES], input: period,
  handler: (ctx, i) => unwrap(ctx.db.rpc("generate_compliance_report", { p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd })) as Promise<Report>,
});

export type LossAllocation = {
  id: string; bbl: string; classification: "sample" | "taproom" | "destruction";
  destination_state: string | null; tax_treatment: string | null; created_at: string; created_by: string;
};
/** A generic loss the review can reattribute: the batch's completion loss, or a
 * cellar transfer loss (#485), which posts while the batch is open (closed_at null). */
export type LossReview = {
  adjustment_id: string; batch_id: string; batch_no: number; closed_at: string | null; kind: "completion" | "transfer";
  original_bbl: string; remaining_bbl: string; allocations: LossAllocation[];
};

defineQuery({
  name: "get_loss_review",
  description: "List generic cellar losses (batch completion and cellar transfer losses) posted in a period with exact original, allocated, and remaining BBL",
  roles: [...ROLES],
  input: z.object({ periodStart: isoDate, periodEnd: isoDate }),
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_loss_review", {
    p_brewery: ctx.breweryId, p_start: i.periodStart, p_end: i.periodEnd,
  })) as Promise<LossReview[]>,
});

defineCommand({
  name: "reattribute_loss",
  description: "Allocate part of a generic cellar loss (batch completion or cellar transfer) to samples, direct cellar Taproom removals, or destruction while preserving the original and exact total; Sample requires a destination state",
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

export type ReportingBasisCorrection = { id: string; old_basis: string | null; new_basis: string | null; corrected_by: string; corrected_at: string; reason: string };
export type BasisAmendment = { filing_id: string; correction_id: string; old_figures: Report["figures"]; new_figures: Report["figures"]; correction: ReportingBasisCorrection };
export type Filing = { id: string; jurisdiction: string; period_start: string; period_end: string; figures: Report["figures"]; filed_at: string | null; filed_by: string | null; note: string | null; created_at: string; needs_amendment?: boolean; basis_amendments?: BasisAmendment[] };

defineCommand({
  name: "correct_reporting_basis",
  description: "Admin correction after filing: record immutable old/new books-opened basis, actor, time and reason, and flag every affected filed period as needing amendment; original snapshots stay unchanged",
  roles: ["admin"],
  input: z.object({ booksOpenedOn: isoDate.nullable(), expectedBooksOpenedOn: isoDate.nullable(), reason: z.string().trim().min(1) }),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("correct_reporting_basis", {
    p_brewery: ctx.breweryId, p_books_opened_on: i.booksOpenedOn, p_expected_books_opened_on: i.expectedBooksOpenedOn,
    p_reason: i.reason, p_request_id: execution.requestId,
  })),
});

defineQuery({
  name: "list_reporting_basis_corrections",
  description: "Immutable reporting-basis correction history, newest first, including old/new values, actor, time and reason",
  roles: [...ROLES], input: z.object({}),
  handler: (ctx) => completeRows<ReportingBasisCorrection>("Reporting basis history", start => ctx.db.from("reporting_basis_corrections")
    .select("*", { count: "exact" }).eq("brewery_id", ctx.breweryId).order("corrected_at", { ascending: false }).order("id").range(start, start + PAGE_SIZE - 1)),
});

defineCommand({
  name: "file_compliance_report", description: "Generate and save an immutable filed snapshot; refused for imbalance, an overlapping filing, a period not yet over, a period that starts before the books opened, a TTB period that is not exactly one calendar month, quarter, or year. MGR does not transmit the filing; filing takes the cellar workflow lock to wait for packaging closes and books-opened changes, rechecks the date, and fixes that reporting basis after the first filing",
  roles: [...ROLES],
  // A partial TTB range would claim days of a real period and block its filing (#486).
  input: period.extend({ note: z.string().optional() }).refine(
    (i) => i.jurisdiction !== "TTB" || periodKey(i.periodStart, i.periodEnd) !== null,
    { message: "a TTB filing covers one calendar month, quarter, or year", path: ["periodEnd"] },
  ),
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("file_compliance_report", {
    p_brewery: ctx.breweryId, p_jurisdiction: i.jurisdiction, p_start: i.periodStart, p_end: i.periodEnd, p_note: i.note ?? null, p_request_id: execution.requestId,
  })),
});

const CADENCES: Cadence[] = ["month", "quarter", "year"];

/** The brewery's today and books-opened date, read together. */
async function todayAndBooksOpened(ctx: Ctx) {
  const [today, brewery] = await Promise.all([breweryToday(ctx),
    unwrap(ctx.db.from("breweries").select("books_opened_on").eq("id", ctx.breweryId).single())]);
  return { today, booksOpenedOn: brewery?.books_opened_on ?? null };
}

defineQuery({
  name: "list_compliance_reports", description: "Filed snapshots, newest period first, optionally one jurisdiction and period, plus the brewery's today and books-opened date for the month list; which recent periods hold activity is list_compliance_active_periods",
  roles: [...ROLES], input: period.partial(),
  handler: async (ctx, i) => {
    let q = ctx.db.from("report_filings").select("*, basis_amendments:report_basis_amendments(*, correction:reporting_basis_corrections(*))")
      .eq("brewery_id", ctx.breweryId).order("period_start", { ascending: false }).order("jurisdiction");
    if (i.jurisdiction) q = q.eq("jurisdiction", i.jurisdiction);
    if (i.periodStart) q = q.eq("period_start", i.periodStart);
    if (i.periodEnd) q = q.eq("period_end", i.periodEnd);
    const [filings, dates] = await Promise.all([rows<Filing>(q), todayAndBooksOpened(ctx)]);
    return {
      filings: filings.map(filing => {
        const affected = (filing.basis_amendments ?? []).sort((a, b) => b.correction.corrected_at.localeCompare(a.correction.corrected_at));
        return { ...filing, needs_amendment: affected.length > 0, basis_amendments: affected };
      }),
      ...dates,
    };
  },
});

// Its own query because the activity scan is the slowest compliance read, and
// only the Compliance list needs it; Settings and a period page do not (#1491).
defineQuery({
  name: "list_compliance_active_periods", description: "The keys of the recent month, quarter and year periods holding any row the period report reads (a finished-goods movement, cellar removal or invoice line); a recent period not listed has no activity",
  roles: [...ROLES], input: z.object({}),
  handler: async (ctx) => {
    const { today, booksOpenedOn } = await todayAndBooksOpened(ctx);
    // The periods the Compliance list shows (#1209); a period is active when one of its months holds report activity.
    const recent = CADENCES.flatMap((cadence) => recentPeriods(today, cadence, booksOpenedOn)).map((key) => ({ key, ...periodRange(key)! }));
    // The function returns '{}', never null, for a range with no activity.
    const months = recent.length === 0 ? [] : await unwrap(ctx.db.rpc("list_compliance_active_months", {
      p_brewery: ctx.breweryId, p_start: recent.map((p) => p.periodStart).sort()[0], p_end: today,
    })) as string[];
    return recent.filter((p) => months.some((m) => m >= p.periodStart && m <= p.periodEnd)).map((p) => p.key);
  },
});

export type LotRowOut = { id: string; code: string; packaged_on: string; brands: { name: string } | null };

defineQuery({
  name: "list_lots", description: "Finished-goods lots, newest packaged first and at most 50, as the entry to a lot trace",
  roles: [...ROLES],
  input: z.object({ q: z.string().trim().max(100).optional().describe("Only lots whose code contains this text, ignoring case") }),
  handler: (ctx, i) => {
    const lots = ctx.db.from("lots").select("id, code, packaged_on, brands(name)").eq("brewery_id", ctx.breweryId).order("packaged_on", { ascending: false }).limit(50);
    return rows<LotRowOut>(i.q ? lots.regexIMatch("code", escapeRegex(i.q)) : lots);
  },
});

type TraceBatch = { id: string; batch_no: number | null; brewed_on: string | null };
type LotRow = {
  id: string; code: string; packaged_on: string; best_by: string | null; brands: { name: string } | null;
  packaging_runs: { id: string; run_no: number | null; bbl_drawn: number | null; vessel_occupancies: { vessels: { name: string } | null; batches: TraceBatch | null } | null; batches: TraceBatch | null } | null;
};
type LotMovement = { id: string; type: string; qty: number; bbl: number; sku_id: string; bin_id: string; ref: string | null; source_movement_id: string | null; created_at: string; skus: { name: string } | null; bins: { name: string } | null; locations: { name: string } | null };

defineQuery({
  name: "trace_lot", description: "One finished-goods lot: its packaging run, member batches and recorded transfers before packaging, every ledger movement that names the lot, and units still on hand; membership is not a proportional share",
  roles: [...ROLES],
  input: z.object({ lotId: z.string().uuid() }),
  handler: async (ctx, i) => {
    // All four reads need only the lot id, so they start together (#1491).
    const [lot, sources, movements, ingredients] = await Promise.all([
      unwrap(ctx.db.from("lots")
        .select("id, code, packaged_on, best_by, brands(name), packaging_runs(id, run_no, bbl_drawn, vessel_occupancies(vessels(name), batches(id, batch_no, brewed_on)), batches(id, batch_no, brewed_on))")
        .eq("id", i.lotId).eq("brewery_id", ctx.breweryId).single()) as unknown as Promise<LotRow>,
      unwrap(ctx.db.rpc("trace_lot_sources", { p_brewery: ctx.breweryId, p_lot: i.lotId })) as unknown as Promise<LotTraceSources>,
      completeRows("Lot trace", start => ctx.db.from("inventory_movements").select("id,type,qty,bbl,sku_id,bin_id,ref,source_movement_id,created_at,skus(name),bins(name),locations(name)", { count: "exact" })
        .eq("brewery_id", ctx.breweryId).eq("lot_id", i.lotId).order("created_at").order("id").range(start, start + PAGE_SIZE - 1)) as unknown as Promise<LotMovement[]>,
      unwrap(ctx.db.rpc("trace_lot_ingredients", { p_brewery: ctx.breweryId, p_lot: i.lotId })),
    ]);
    const orderIds = [...new Set(movements.filter(m => m.type === "sale_removal" && m.ref).map(m => m.ref!))];
    const [recipients, references] = await Promise.all([
      recipientsFor(ctx, orderIds),
      movementReferences(ctx, movements.map(movement => movement.ref)),
    ]);
    const run = lot.packaging_runs;
    const occ = run?.vessel_occupancies;
    const moves = movements.map((m) => {
      const reference = references.get(m.ref ?? "");
      return {
        id: m.id, type: m.type, qty: Number(m.qty), bbl: Number(m.bbl),
        sku_id: m.sku_id, bin_id: m.bin_id, bin: m.bins?.name ?? "",
        ref: m.ref, ref_label: reference?.ref_label ?? null, ref_kind: reference?.ref_kind ?? null,
        source_movement_id: m.source_movement_id, created_at: m.created_at,
        sku: m.skus?.name ?? "", location: m.locations?.name ?? "",
      };
    });
    const balances = new Map<string, { sku_id: string; sku: string; bin_id: string; bin: string; location: string; qty: number; bbl: number }>();
    for (const m of moves) {
      const key = `${m.sku_id}:${m.bin_id}`;
      const b = balances.get(key) ?? { sku_id: m.sku_id, sku: m.sku, bin_id: m.bin_id, bin: m.bin, location: m.location, qty: 0, bbl: 0 };
      b.qty += m.qty; b.bbl += m.bbl; balances.set(key, b);
    }
    return {
      lot: { id: lot.id, code: lot.code, brand: lot.brands?.name ?? "", packaged_on: lot.packaged_on, best_by: lot.best_by },
      run: run ? { id: run.id, run_no: run.run_no, bbl_drawn: run.bbl_drawn, vessel: occ?.vessels?.name ?? "" } : null,
      // A historical run has no tank; it names its batch directly (historical-packaging.md).
      batch: occ?.batches ?? run?.batches ?? null,
      ...sources,
      ingredients,
      movements: moves,
      balances: [...balances.values()], on_hand_bbl: moves.reduce((n, m) => n + m.bbl, 0), recipients,
      // Compatibility only when all units are the same SKU; never sum package units.
      on_hand: new Set(moves.map(m => m.sku_id)).size <= 1 ? moves.reduce((n, m) => n + m.qty, 0) : null,
      warning: "Stock recorded without this lot code is not traced here.",
    };
  },
});


defineQuery({
  name: "trace_material_lot",
  description: "One ingredient or packaging-material lot: effective consumption in batches and runs, finished lots through recorded blend lineage, actual shipment recipients, and remaining recorded material; corrections reverse prior usage",
  roles: [...ROLES],
  input: z.object({ materialLotId: z.string().uuid() }),
  handler: async (ctx, input) => {
    const trace = await unwrap(ctx.db.rpc("trace_material_lot", { p_brewery: ctx.breweryId, p_material_lot: input.materialLotId })) as unknown as MaterialLotTraceSnapshot & { order_ids: string[] };
    const { order_ids, ...snapshot } = trace;
    return {
      ...snapshot,
      recipients: await recipientsFor(ctx, order_ids),
      warning: "Only recorded material identities and effective consumption are traced. Historical untracked stock cannot be assigned to a lot; recorded blend membership is not a proportional share.",
    };
  },
});
