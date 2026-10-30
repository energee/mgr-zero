import { canRetireCommandFailure } from "@/lib/commands/failure";
import { bblExact } from "@/lib/volume";
import { submitReason } from "@/lib/mgr/submit-reason";
import type { TaproomLineMovementType } from "@/lib/supabase/rpc-results";

export type TaproomCountSnapshotLine = {
  bin_id: string;
  bin_name: string;
  sku_id: string;
  sku_name: string;
  brand_id: string;
  brand_name: string;
  bbl_per_unit: number;
  lot_id: string | null;
  qty_before: number;
};

export type TaproomCountSnapshot = {
  location_id: string;
  counted_on: string;
  prior_count: { id: string; counted_on: string } | null;
  revision: string;
  lines: TaproomCountSnapshotLine[];
};

type CapturedPriorCount = TaproomCountSnapshot["prior_count"];

export type TaproomCountInput = {
  locationId: string;
  countedOn: string;
  revision: string;
  lines: { binId: string; skuId: string; lotId: string | null; qtyCounted: number; disposition?: "destroyed" }[];
};

export type CountDraftLine = {
  key: string;
  binId: string;
  binName: string;
  skuId: string;
  skuName: string;
  brandId: string;
  brandName: string;
  bblPerUnit: number;
  lotId: string | null;
  qtyBefore: number;
  quantity: string;
  disposition?: "sold" | "destroyed";
};

type FrozenAttempt = { kind: "submitting" | "unknown"; requestId: string; payload: TaproomCountInput; message?: string };
type CountAttempt = FrozenAttempt | { kind: "idle" } | { kind: "stale" | "error"; message: string };
export type CountFailureKind = "unknown" | "stale" | "error";

export type TaproomCountState = {
  draft: { locationId: string; countedOn: string; priorCount: CapturedPriorCount; revision: string; lines: CountDraftLine[] };
  projection: unknown;
  attempt: CountAttempt;
};

export type TaproomCorrectionLine = {
  id: string;
  sku_name: string | null;
  bin_name: string | null;
  lot_id: string | null;
  lot_code: string | null;
  qty_before: number;
  qty_counted: number;
  movement_type?: TaproomLineMovementType;
};

export type TaproomCorrectionInput = {
  countId: string;
  corrections: { lineId: string; qtyCounted: number }[];
  reason: string;
};

type FrozenCorrectionAttempt = { kind: "submitting" | "unknown"; requestId: string; payload: TaproomCorrectionInput; message?: string };
export type TaproomCorrectionState = {
  countId: string;
  reason: string;
  lines: (TaproomCorrectionLine & { quantity: string })[];
  attempt: FrozenCorrectionAttempt | { kind: "idle" | "saved" } | { kind: "error"; message: string };
};

export function correctionStateFromReceipt(countId: string, lines: TaproomCorrectionLine[]): TaproomCorrectionState {
  return {
    countId,
    reason: "",
    lines: lines.map((line) => ({ ...line, qty_before: Number(line.qty_before), qty_counted: Number(line.qty_counted), quantity: String(Number(line.qty_counted)) })),
    attempt: { kind: "idle" },
  };
}

function correctionLocked(state: TaproomCorrectionState) {
  return state.attempt.kind === "submitting" || state.attempt.kind === "unknown" || state.attempt.kind === "saved";
}

export function updateCorrectionQuantity(state: TaproomCorrectionState, lineId: string, quantity: string): TaproomCorrectionState {
  if (correctionLocked(state)) return state;
  return { ...state, attempt: { kind: "idle" }, lines: state.lines.map((line) => line.id === lineId && line.movement_type !== "destruction" ? { ...line, quantity } : line) };
}

export function updateCorrectionReason(state: TaproomCorrectionState, reason: string): TaproomCorrectionState {
  if (correctionLocked(state)) return state;
  return { ...state, reason, attempt: { kind: "idle" } };
}

function correctionPayload(state: TaproomCorrectionState): TaproomCorrectionInput {
  const reason = state.reason.trim();
  if (!reason) throw new Error("Enter a reason for the count correction.");
  const corrections = state.lines.flatMap((line) => {
    if (line.movement_type === "destruction") return [];
    if (!/^\d+$/.test(line.quantity)) throw new Error("Correct to whole packaged units.");
    const qtyCounted = Number(line.quantity);
    if (!Number.isSafeInteger(qtyCounted)) throw new Error("Correct to whole packaged units.");
    if (qtyCounted > line.qty_before) throw new Error("A count correction cannot exceed the recorded stock before the count.");
    return qtyCounted === line.qty_counted ? [] : [{ lineId: line.id, qtyCounted }];
  });
  if (corrections.length === 0) throw new Error("Please change at least one counted quantity.");
  return { countId: state.countId, corrections, reason };
}

export function beginCorrectionAttempt(state: TaproomCorrectionState, requestId: string): TaproomCorrectionState {
  if (state.attempt.kind === "saved" || state.attempt.kind === "submitting") return state;
  if (state.attempt.kind === "unknown") return { ...state, attempt: { ...state.attempt, kind: "submitting", message: undefined } };
  return { ...state, attempt: { kind: "submitting", requestId, payload: correctionPayload(state) } };
}

export function failCorrectionAttempt(state: TaproomCorrectionState, kind: "unknown" | "error", message: string): TaproomCorrectionState {
  if (kind === "unknown" && state.attempt.kind === "submitting") return { ...state, attempt: { ...state.attempt, kind, message } };
  return { ...state, attempt: { kind: "error", message } };
}

export function completeCorrectionAttempt(state: TaproomCorrectionState): TaproomCorrectionState {
  return { ...state, attempt: { kind: "saved" } };
}

const bucketKey = (line: Pick<TaproomCountSnapshotLine, "bin_id" | "sku_id" | "lot_id">) =>
  `${line.bin_id}:${line.sku_id}:${line.lot_id ?? "untracked"}`;
const baselineChangedMessage = "A newer saved count changed the comparison baseline. Start a fresh recount.";

export function countDraftFromSnapshot(snapshot: TaproomCountSnapshot, projection: unknown): TaproomCountState {
  const state: TaproomCountState = {
    draft: {
      locationId: snapshot.location_id,
      countedOn: snapshot.counted_on,
      priorCount: snapshot.prior_count,
      revision: snapshot.revision,
      lines: snapshot.lines.map((line) => ({
        key: bucketKey(line), binId: line.bin_id, binName: line.bin_name, skuId: line.sku_id, skuName: line.sku_name,
        brandId: line.brand_id, brandName: line.brand_name, bblPerUnit: Number(line.bbl_per_unit),
        lotId: line.lot_id, qtyBefore: Number(line.qty_before), quantity: "", disposition: "sold",
      })),
    },
    projection,
    attempt: { kind: "idle" },
  };
  return projectionMatchesCountDraft(state) ? state : { ...state, attempt: { kind: "stale", message: baselineChangedMessage } };
}

/** The draft's buckets by SKU, then bin, name for the screen. `row` stays the
 *  bucket's place in the snapshot: the worksheet row its printed label carries. */
export function worksheetOrder<L extends Pick<CountDraftLine, "skuName" | "binName">>(lines: L[]) {
  return lines.map((line, index) => ({ line, row: index + 1 }))
    .sort((a, b) => a.line.skuName.localeCompare(b.line.skuName) || a.line.binName.localeCompare(b.line.binName));
}

// A frozen or stale count accepts no edits until it is recovered or recounted.
export function countLocked(state: TaproomCountState) {
  return state.attempt.kind === "unknown" || state.attempt.kind === "submitting" || state.attempt.kind === "stale";
}

// True when the entered quantity is a whole number of units below the recorded stock.
export function isShortage(line: Pick<CountDraftLine, "quantity" | "qtyBefore">) {
  return /^\d+$/.test(line.quantity) && Number.isSafeInteger(Number(line.quantity)) && Number(line.quantity) < line.qtyBefore;
}

export function countQuantityError(line: Pick<CountDraftLine, "quantity" | "qtyBefore">): string | undefined {
  if (line.quantity === "") return "Count every displayed bucket explicitly, including zero.";
  if (!/^\d+$/.test(line.quantity) || !Number.isSafeInteger(Number(line.quantity))) return "Count remaining whole packaged units; a partial keg counts as one until gone.";
  if (Number(line.quantity) > line.qtyBefore) return "Count exceeds recorded stock; ask Warehouse to investigate.";
}

export function countSubmitReason(state: TaproomCountState): string | null {
  if (state.attempt.kind === "unknown") return null;
  if (state.attempt.kind === "submitting") return submitReason(["the current count to finish recording"]);
  if (state.attempt.kind === "stale" || !projectionMatchesCountDraft(state)) return submitReason(["a fresh recount"]);
  return submitReason(state.draft.lines.some(line => countQuantityError(line)) ? ["a whole-package count within recorded stock for every bucket, including zero"] : []);
}

export function updateCountQuantity(state: TaproomCountState, key: string, quantity: string): TaproomCountState {
  if (countLocked(state)) return state;
  return { ...state, attempt: { kind: "idle" }, draft: { ...state.draft, lines: state.draft.lines.map((line) => line.key === key ? { ...line, quantity, disposition: isShortage({ quantity, qtyBefore: line.qtyBefore }) ? line.disposition : "sold" } : line) } };
}

// A disposition belongs only to a real shortage and freezes with the same request.
export function updateCountDisposition(state: TaproomCountState, key: string, disposition: "sold" | "destroyed"): TaproomCountState {
  if (countLocked(state)) return state;
  return { ...state, draft: { ...state.draft, lines: state.draft.lines.map(line =>
    line.key === key && isShortage(line) ? { ...line, disposition } : line) } };
}

type ProjectionPrior = { id: string; counted_on: string } | null;

function declaredProjectionPrior(projection: unknown): { declared: boolean; prior: ProjectionPrior } {
  if (typeof projection !== "object" || projection === null || !("prior_count" in projection)) return { declared: false, prior: null };
  return { declared: true, prior: (projection as { prior_count: ProjectionPrior }).prior_count };
}

export function projectionMatchesCountDraft(state: TaproomCountState): boolean {
  const projected = declaredProjectionPrior(state.projection);
  if (!projected.declared) return true;
  const captured = state.draft.priorCount;
  return captured === null ? projected.prior === null
    : projected.prior?.id === captured.id && projected.prior.counted_on === captured.counted_on;
}

export function replaceCountProjection(state: TaproomCountState, projection: unknown): TaproomCountState {
  const next = { ...state, projection };
  if (state.attempt.kind === "unknown" || state.attempt.kind === "submitting" || projectionMatchesCountDraft(next)) return next;
  return { ...next, attempt: { kind: "stale", message: baselineChangedMessage } };
}

type ProjectionForComparison = {
  coverage_complete?: boolean;
  unmapped_lines?: number;
  rows?: { brand_id: string; brand_name: string; expected_bbl: number }[];
};

export type CountBrandComparison = {
  brandId: string;
  brandName: string;
  expectedBbl: number | null;
  actualBbl: number | null;
  differenceBbl: number | null;
  complete: boolean;
};

export function countBrandComparison(state: TaproomCountState): CountBrandComparison[] {
  if (!projectionMatchesCountDraft(state)) return [];
  const projection = (state.projection ?? {}) as ProjectionForComparison;
  const projected = new Map((projection.rows ?? []).map((row) => [row.brand_id, row]));
  const grouped = new Map<string, { brandName: string; actualBbl: number; complete: boolean }>();
  for (const line of state.draft.lines) {
    const group = grouped.get(line.brandId) ?? { brandName: line.brandName, actualBbl: 0, complete: true };
    const valid = !countQuantityError(line);
    group.complete &&= valid;
    if (valid && line.disposition !== "destroyed") group.actualBbl += (line.qtyBefore - Number(line.quantity)) * line.bblPerUnit;
    grouped.set(line.brandId, group);
  }
  const ids = new Set([...grouped.keys(), ...projected.keys()]);
  return [...ids].map((brandId) => {
    const physical = grouped.get(brandId);
    const expectedRow = projected.get(brandId);
    const expectedBbl = expectedRow ? Number(expectedRow.expected_bbl)
      : projection.coverage_complete && Number(projection.unmapped_lines ?? 0) === 0 ? 0 : null;
    const complete = physical?.complete ?? true;
    const actualBbl = physical ? (complete ? physical.actualBbl : null) : 0;
    return {
      brandId,
      brandName: physical?.brandName ?? expectedRow!.brand_name,
      expectedBbl,
      actualBbl,
      differenceBbl: expectedBbl === null || actualBbl === null ? null : expectedBbl - actualBbl,
      complete,
    };
  }).sort((a, b) => a.brandName.localeCompare(b.brandName) || a.brandId.localeCompare(b.brandId));
}

export function replaceCountSnapshot(state: TaproomCountState, snapshot: TaproomCountSnapshot): TaproomCountState {
  return { ...countDraftFromSnapshot(snapshot, state.projection), projection: state.projection };
}

function payload(state: TaproomCountState): TaproomCountInput {
  const lines = state.draft.lines.map((line) => {
    const error = countQuantityError(line);
    if (error) throw new Error(error);
    const qtyCounted = Number(line.quantity);
    return { binId: line.binId, skuId: line.skuId, lotId: line.lotId, qtyCounted, ...(line.disposition === "destroyed" ? { disposition: "destroyed" as const } : {}) };
  });
  return { locationId: state.draft.locationId, countedOn: state.draft.countedOn, revision: state.draft.revision, lines };
}

export function beginCountAttempt(state: TaproomCountState, requestId: string): TaproomCountState {
  if (state.attempt.kind === "submitting" || state.attempt.kind === "stale") return state;
  if (state.attempt.kind === "unknown") return { ...state, attempt: { ...state.attempt, kind: "submitting", message: undefined } };
  if (!projectionMatchesCountDraft(state)) throw new Error(baselineChangedMessage);
  return { ...state, attempt: { kind: "submitting", requestId, payload: payload(state) } };
}

export function failCountAttempt(state: TaproomCountState, kind: "unknown" | "stale" | "error", message: string): TaproomCountState {
  if (kind === "unknown" && state.attempt.kind === "submitting") return { ...state, attempt: { ...state.attempt, kind, message } };
  if (state.attempt.kind === "stale") return { ...state, attempt: { kind: "stale", message } };
  if (!projectionMatchesCountDraft(state)) return { ...state, attempt: { kind: "stale", message: baselineChangedMessage } };
  return { ...state, attempt: { kind: kind === "unknown" ? "error" : kind, message } };
}

export function countFailureKind(status: number | null, message: string, retrying = false, code?: string): CountFailureKind {
  if (retrying) return "unknown";
  if (code === "context_changed") return "unknown";
  if (status === 409 && /stock or prior count changed; refresh and review every bucket|count today in the brewery timezone/i.test(message)) return "stale";
  return status !== null && canRetireCommandFailure(status, false, code) ? "error" : "unknown";
}

/** The expected volume ("1.5 bbl") that follows "Expected total"; null when unknown. */
export function projectionExpectedText(projection: { expected_bbl: number | null }): string | null {
  return projection.expected_bbl === null ? null : bblExact(projection.expected_bbl, 4);
}
