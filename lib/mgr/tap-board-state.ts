import { canRetireCommandFailure } from "@/lib/commands/failure";
import { submitReason } from "@/lib/mgr/submit-reason";
import { tapNumberSchema, TAP_NUMBER_NEED } from "@/lib/tap-number";

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
type IncomingKeg = { skuId: string } | { label: string; nominalBbl: number };
export type TapCommandPayload =
  | { locationId: string; keg: IncomingKeg; tapNumber?: string; openingFill: .25 | .5 | .6 | 1 }
  | { openIntervalId: string; closeFill: 0 | .25 | .5; reason: string }
  | { openIntervalId: string; incomingKeg?: IncomingKeg; tapNumber?: string; incomingOpeningFill: .25 | .5 | .6 | 1; closeFill: 0 | .25 | .5; reason: string };

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

/** `firstSkuId` is the keg SKU a new tap starts on (the first in the picker),
 *  so the inventory and the live board open the same sheet. A swap or kick
 *  starts on its open keg's SKU instead. */
export function openTapBoardSheet(snapshot: TapBoardSnapshot, kind: TapBoardSheet["kind"], interval: TapInterval | null, locationId = "", firstSkuId = ""): TapBoardState {
  return { snapshot, sheet: { kind, interval, attempt: { kind: "idle" }, fields: {
    locationId: interval?.location_id ?? locationId,
    identity: kind === "swap" ? interval?.sku_id ? "same" : "guest" : "own",
    skuId: interval ? interval.sku_id ?? "" : firstSkuId,
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

export function createTapBoardRefreshGuard() {
  let latestStarted = 0;
  return {
    async run(load: () => Promise<TapBoardSnapshot>): Promise<TapBoardSnapshot | null> {
      const request = ++latestStarted;
      try {
        const snapshot = await load();
        return request === latestStarted ? snapshot : null;
      } catch (error) {
        if (request !== latestStarted) return null;
        throw error;
      }
    },
  };
}

export type TapBoardSaveResult = { kind: "saved"; snapshot: TapBoardSnapshot | null; refreshError: unknown | null };

export async function submitAndRefreshTapBoard(
  write: () => Promise<unknown>,
  refresh: () => Promise<TapBoardSnapshot | null>,
): Promise<{ kind: "write_failed"; error: unknown } | TapBoardSaveResult> {
  try { await write(); }
  catch (error) { return { kind: "write_failed", error }; }
  try { return { kind: "saved", snapshot: await refresh(), refreshError: null }; }
  catch (refreshError) { return { kind: "saved", snapshot: null, refreshError }; }
}

export function pollErrorAfterTapBoardSave(current: string | null, result: TapBoardSaveResult): string | null {
  if (result.snapshot) return null;
  return result.refreshError === null ? current : "Tap action saved. Board refresh failed; reload when the connection returns.";
}

type TapSheetNeeds = Partial<Record<"reason" | "skuId" | "guestLabel" | "guestNominalBbl" | "tapNumber", string>>;

/** What the sheet's fields still lack, keyed by field, each phrased as a need
 *  ("a guest keg label"). The one rule set: the withheld submit names these
 *  (tapSheetReason), the guest fields mark theirs, and payload() refuses them.
 *  One case is not a need: a "same" swap whose open keg has no SKU to reuse.
 *  The picker disables that option, and payload() refuses it if it arrives. */
export function tapSheetNeeds(sheet: TapBoardSheet): TapSheetNeeds {
  const fields = sheet.fields, needs: TapSheetNeeds = {};
  if (sheet.kind !== "tap" && !fields.reason.trim()) needs.reason = "a closing reason";
  if (sheet.kind === "kick") return needs;
  if (fields.identity === "own" && !fields.skuId) needs.skuId = "a packaged keg SKU";
  if (fields.identity === "guest") {
    const nominalBbl = Number(fields.guestNominalBbl);
    if (!fields.guestLabel.trim()) needs.guestLabel = "a guest keg label";
    if (!(Number.isFinite(nominalBbl) && nominalBbl > 0)) needs.guestNominalBbl = "a guest nominal bbl above zero";
  }
  if (fields.tapNumber !== "" && !tapNumberSchema.safeParse(fields.tapNumber).success) needs.tapNumber = TAP_NUMBER_NEED;
  return needs;
}

/** Why Tap keg, Kick keg or Swap is withheld, or null when the sheet is ready. */
export const tapSheetReason = (sheet: TapBoardSheet) => submitReason(Object.values(tapSheetNeeds(sheet)));

/** The keg going on, once tapSheetNeeds is empty. "same" (a swap reusing the
 *  open keg's SKU) sends none; a tap sheet never has identity "same". */
function incomingKeg(fields: TapSheetFields): IncomingKeg | undefined {
  if (fields.identity === "own") return { skuId: fields.skuId };
  if (fields.identity === "guest") return { label: fields.guestLabel.trim(), nominalBbl: Number(fields.guestNominalBbl) };
}

function payload(sheet: TapBoardSheet): TapCommandPayload {
  const reason = tapSheetReason(sheet);
  if (reason) throw new Error(reason);
  const tapNumber = sheet.fields.tapNumber.trim() || undefined;
  // A tap sheet's identity is "own" or "guest", so incomingKeg returns a keg.
  if (sheet.kind === "tap") return { locationId: sheet.fields.locationId, keg: incomingKeg(sheet.fields)!, tapNumber, openingFill: sheet.fields.openingFill };
  if (!sheet.interval) throw new Error("Choose an open keg.");
  const close = { openIntervalId: sheet.interval.id, closeFill: sheet.fields.closeFill, reason: sheet.fields.reason.trim() };
  if (sheet.kind === "kick") return close;
  if (sheet.fields.identity === "same") {
    if (!sheet.interval.sku_id) throw new Error("The open keg has no SKU to reuse. Choose Own keg or Guest keg.");
    return { ...close, tapNumber, incomingOpeningFill: sheet.fields.openingFill };
  }
  return { ...close, incomingKeg: incomingKeg(sheet.fields), tapNumber, incomingOpeningFill: sheet.fields.openingFill };
}

export function beginTapBoardAttempt(state: TapBoardState, requestId: string): TapBoardState {
  if (!state.sheet) throw new Error("Open a tap action first.");
  if (state.sheet.attempt.kind === "submitting") return state;
  const attempt = state.sheet.attempt.kind === "unknown"
    ? { ...state.sheet.attempt, kind: "submitting" as const, message: undefined }
    : { kind: "submitting" as const, requestId, payload: payload(state.sheet) };
  return { ...state, sheet: { ...state.sheet, attempt } };
}

export function failTapBoardAttempt(state: TapBoardState, status: number | null, message: string, retrying: boolean, code?: string): TapBoardState {
  if (!state.sheet) return state;
  const attempt = state.sheet.attempt;
  if (attempt.kind !== "submitting") return state;
  return { ...state, sheet: { ...state.sheet, attempt: status !== null && canRetireCommandFailure(status, retrying, code)
    ? { kind: "error", message }
    : { ...attempt, kind: "unknown", message } } };
}

export function setTapBoardError(state: TapBoardState, message: string): TapBoardState {
  return state.sheet ? { ...state, sheet: { ...state.sheet, attempt: { kind: "error", message } } } : state;
}

export const tapBoardCommand = (sheet: TapBoardSheet) => sheet.kind === "tap" ? "tap_keg" : sheet.kind === "kick" ? "kick_keg" : "swap_keg";

export const tapLabel = (tap: TapInterval) => tap.sku_name ?? tap.label ?? "Keg";

/** The fill chips' labels, on one percent scale (#1192). The tiles and the
 *  history print these same words, so "Full" is the one word for a full keg.
 *  Labels only: the stored fills are fixed by the tap_intervals CHECK constraints. */
export const OPENING_FILLS = [[.25, "25%"], [.5, "50%"], [.6, "60%"], [1, "Full"]] as const;
export const CLOSING_FILLS = [[0, "Empty"], [.25, "About 25% left"], [.5, "About 50% left"]] as const;

/** The chip label for a stored fill. The CHECK constraints keep every stored
 *  fill in its list, so the lookup always finds one. */
export const fillLabel = (options: readonly (readonly [number, string])[], fill: number) =>
  options.find(([value]) => value === Number(fill))![1];
