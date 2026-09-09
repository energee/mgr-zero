import { canRetireCommandFailure } from "@/lib/commands/failure";

export type TapInterval = {
  id: string;
  location_id: string;
  sku_id: string | null;
  label: string | null;
  nominal_bbl: number;
  tap_number: string | null;
  opening_fill: number;
  not_in_inventory: boolean;
  opened_at: string;
  opened_by: string;
  opened_by_label: string | null;
  brand_id: string | null;
  brand_name: string | null;
  sku_name: string | null;
};

export type TapHistory = TapInterval & {
  closed_at: string;
  closed_by: string;
  closed_by_label: string | null;
  closing_fill: number;
  close_reason: string;
};

export type TapBoardSnapshot = { open: TapInterval[]; history: TapHistory[] };
export type TapCommandPayload =
  | { locationId: string; keg: { skuId: string } | { label: string; nominalBbl: number }; tapNumber?: string; openingFill: .25 | .5 | .6 | 1 }
  | { openIntervalId: string; closeFill: 0 | .25 | .5; reason: string }
  | { openIntervalId: string; incomingKeg?: { skuId: string } | { label: string; nominalBbl: number }; tapNumber?: string; incomingOpeningFill: .25 | .5 | .6 | 1; closeFill: 0 | .25 | .5; reason: string };

type Attempt =
  | { kind: "idle" }
  | { kind: "submitting" | "unknown"; requestId: string; payload: TapCommandPayload; message?: string }
  | { kind: "error"; message: string };

export type TapSheetFields = {
  locationId: string;
  identity: "same" | "own" | "guest";
  skuId: string;
  guestLabel: string;
  guestNominalBbl: string;
  tapNumber: string;
  openingFill: .25 | .5 | .6 | 1;
  closeFill: 0 | .25 | .5;
  reason: string;
};

export type TapBoardSheet = {
  kind: "tap" | "kick" | "swap";
  interval: TapInterval | null;
  fields: TapSheetFields;
  attempt: Attempt;
};

export type TapBoardState = { snapshot: TapBoardSnapshot; sheet: TapBoardSheet | null };
export const TAP_BOARD_POLL_MS = 30_000;

export function openTapBoardSheet(snapshot: TapBoardSnapshot, kind: TapBoardSheet["kind"], interval: TapInterval | null, locationId = ""): TapBoardState {
  return { snapshot, sheet: { kind, interval, attempt: { kind: "idle" }, fields: {
    locationId: interval?.location_id ?? locationId,
    identity: kind === "swap" ? interval?.sku_id ? "same" : "guest" : "own",
    skuId: interval?.sku_id ?? "",
    guestLabel: "",
    guestNominalBbl: "",
    tapNumber: interval?.tap_number ?? "",
    openingFill: 1,
    closeFill: 0,
    reason: "Kicked empty",
  } } };
}

export function editTapBoardSheet(state: TapBoardState, fields: Partial<TapSheetFields>): TapBoardState {
  if (!state.sheet) return state;
  if (state.sheet.attempt.kind === "unknown" || state.sheet.attempt.kind === "submitting") throw new Error("This request is frozen until its result is known.");
  return { ...state, sheet: { ...state.sheet, fields: { ...state.sheet.fields, ...fields }, attempt: { kind: "idle" } } };
}

export function replaceTapBoardSnapshot(state: TapBoardState, snapshot: TapBoardSnapshot): TapBoardState {
  return { ...state, snapshot };
}

export function completeTapBoardAttempt(state: TapBoardState, snapshot: TapBoardSnapshot | null): TapBoardState {
  return { snapshot: snapshot ?? state.snapshot, sheet: null };
}

export async function submitAndRefreshTapBoard(
  write: () => Promise<unknown>,
  refresh: () => Promise<TapBoardSnapshot>,
): Promise<{ kind: "write_failed"; error: unknown } | { kind: "saved"; snapshot: TapBoardSnapshot | null; refreshError: unknown | null }> {
  try { await write(); }
  catch (error) { return { kind: "write_failed", error }; }
  try { return { kind: "saved", snapshot: await refresh(), refreshError: null }; }
  catch (refreshError) { return { kind: "saved", snapshot: null, refreshError }; }
}

function keg(fields: TapSheetFields) {
  if (fields.identity === "own") {
    if (!fields.skuId) throw new Error("Choose an own packaged keg SKU.");
    return { skuId: fields.skuId };
  }
  if (fields.identity === "guest") {
    const label = fields.guestLabel.trim(), nominalBbl = Number(fields.guestNominalBbl);
    if (!label || !Number.isFinite(nominalBbl) || nominalBbl <= 0) throw new Error("Guest kegs need a label and positive nominal BBL.");
    return { label, nominalBbl };
  }
}

function payload(sheet: TapBoardSheet): TapCommandPayload {
  const tapNumber = sheet.fields.tapNumber.trim() || undefined;
  if (sheet.kind === "tap") return { locationId: sheet.fields.locationId, keg: keg(sheet.fields)!, tapNumber, openingFill: sheet.fields.openingFill };
  if (!sheet.interval) throw new Error("Choose an open keg.");
  const close = { openIntervalId: sheet.interval.id, closeFill: sheet.fields.closeFill, reason: sheet.fields.reason.trim() };
  if (!close.reason) throw new Error("Choose a closing reason.");
  if (sheet.kind === "kick") return close;
  if (sheet.fields.identity === "same") {
    if (!sheet.interval.sku_id) throw new Error("Guest replacements need an explicit identity.");
    return { ...close, tapNumber, incomingOpeningFill: sheet.fields.openingFill };
  }
  return { ...close, incomingKeg: keg(sheet.fields), tapNumber, incomingOpeningFill: sheet.fields.openingFill };
}

export function beginTapBoardAttempt(state: TapBoardState, requestId: string): TapBoardState {
  if (!state.sheet) throw new Error("Open a tap action first.");
  if (state.sheet.attempt.kind === "submitting") return state;
  const attempt = state.sheet.attempt.kind === "unknown"
    ? { ...state.sheet.attempt, kind: "submitting" as const, message: undefined }
    : { kind: "submitting" as const, requestId, payload: payload(state.sheet) };
  return { ...state, sheet: { ...state.sheet, attempt } };
}

export function failTapBoardAttempt(state: TapBoardState, status: number | null, message: string, retrying: boolean): TapBoardState {
  if (!state.sheet) return state;
  const attempt = state.sheet.attempt;
  if (attempt.kind !== "submitting") return state;
  return { ...state, sheet: { ...state.sheet, attempt: status !== null && canRetireCommandFailure(status, retrying)
    ? { kind: "error", message }
    : { ...attempt, kind: "unknown", message } } };
}

export function setTapBoardError(state: TapBoardState, message: string): TapBoardState {
  return state.sheet ? { ...state, sheet: { ...state.sheet, attempt: { kind: "error", message } } } : state;
}

export const tapBoardCommand = (sheet: TapBoardSheet) => sheet.kind === "tap" ? "tap_keg" : sheet.kind === "kick" ? "kick_keg" : "swap_keg";

export const tapLabel = (tap: TapInterval) => tap.sku_name ?? tap.label ?? "Keg";
