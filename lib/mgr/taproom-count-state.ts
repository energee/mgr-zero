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
  lines: { binId: string; skuId: string; lotId: string | null; qtyCounted: number }[];
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
};

type FrozenAttempt = { kind: "submitting" | "unknown"; requestId: string; payload: TaproomCountInput; message?: string };
type CountAttempt = FrozenAttempt | { kind: "idle" } | { kind: "stale" | "error"; message: string };

export type TaproomCountState = {
  draft: { locationId: string; countedOn: string; priorCount: CapturedPriorCount; revision: string; lines: CountDraftLine[] };
  projection: unknown;
  attempt: CountAttempt;
};

const bucketKey = (line: Pick<TaproomCountSnapshotLine, "bin_id" | "sku_id" | "lot_id">) =>
  `${line.bin_id}:${line.sku_id}:${line.lot_id ?? "untracked"}`;

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
        lotId: line.lot_id, qtyBefore: Number(line.qty_before), quantity: "",
      })),
    },
    projection,
    attempt: { kind: "idle" },
  };
  return projectionMatchesCountDraft(state) ? state : { ...state, attempt: { kind: "stale", message: "A newer saved count changed the comparison baseline. Start a fresh recount." } };
}

export function updateCountQuantity(state: TaproomCountState, key: string, quantity: string): TaproomCountState {
  if (state.attempt.kind === "unknown" || state.attempt.kind === "submitting" || state.attempt.kind === "stale") return state;
  return { ...state, attempt: { kind: "idle" }, draft: { ...state.draft, lines: state.draft.lines.map((line) => line.key === key ? { ...line, quantity } : line) } };
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
  return { ...next, attempt: { kind: "stale", message: "A newer saved count changed the comparison baseline. Start a fresh recount." } };
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
    const valid = /^\d+$/.test(line.quantity) && Number.isSafeInteger(Number(line.quantity)) && Number(line.quantity) <= line.qtyBefore;
    group.complete &&= valid;
    if (valid) group.actualBbl += (line.qtyBefore - Number(line.quantity)) * line.bblPerUnit;
    grouped.set(line.brandId, group);
  }
  const ids = new Set([...grouped.keys(), ...projected.keys()]);
  return [...ids].map((brandId) => {
    const physical = grouped.get(brandId);
    const expectedRow = projected.get(brandId);
    const expectedBbl = expectedRow ? Number(expectedRow.expected_bbl)
      : projection.coverage_complete && Number(projection.unmapped_lines ?? 0) === 0 ? 0 : null;
    const complete = physical?.complete ?? false;
    const actualBbl = complete ? physical!.actualBbl : null;
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
  if (state.draft.lines.some((line) => line.quantity === "")) throw new Error("Count every displayed bucket explicitly, including zero.");
  const lines = state.draft.lines.map((line) => {
    if (!/^\d+$/.test(line.quantity)) throw new Error("Count remaining whole packaged units; a partial keg counts as one until gone.");
    const qtyCounted = Number(line.quantity);
    if (!Number.isSafeInteger(qtyCounted)) throw new Error("Count remaining whole packaged units; a partial keg counts as one until gone.");
    if (qtyCounted > line.qtyBefore) throw new Error("Count exceeds recorded stock; ask Warehouse to investigate. Count correction is not yet available.");
    return { binId: line.binId, skuId: line.skuId, lotId: line.lotId, qtyCounted };
  });
  return { locationId: state.draft.locationId, countedOn: state.draft.countedOn, revision: state.draft.revision, lines };
}

export function beginCountAttempt(state: TaproomCountState, requestId: string): TaproomCountState {
  if (state.attempt.kind === "unknown") return { ...state, attempt: { ...state.attempt, kind: "submitting", message: undefined } };
  return { ...state, attempt: { kind: "submitting", requestId, payload: payload(state) } };
}

export function failCountAttempt(state: TaproomCountState, kind: "unknown" | "stale" | "error", message: string): TaproomCountState {
  if (kind === "unknown" && state.attempt.kind === "submitting") return { ...state, attempt: { ...state.attempt, kind, message } };
  return { ...state, attempt: { kind: kind === "unknown" ? "error" : kind, message } };
}

export function projectionExpectedText(projection: { expected_bbl: number | null }): string | null {
  return projection.expected_bbl === null ? null : `${Number(projection.expected_bbl).toLocaleString("en-US", { maximumFractionDigits: 4 })} bbl expected`;
}
