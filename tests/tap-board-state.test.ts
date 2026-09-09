import { describe, expect, it, vi } from "vitest";
import {
  beginTapBoardAttempt,
  completeTapBoardAttempt,
  createTapBoardRefreshGuard,
  editTapBoardSheet,
  failTapBoardAttempt,
  openTapBoardSheet,
  pollErrorAfterTapBoardSave,
  replaceTapBoardSnapshot,
  submitAndRefreshTapBoard,
  TAP_BOARD_POLL_MS,
  type TapBoardSnapshot,
} from "@/lib/mgr/tap-board-state";

const id = "11111111-1111-4111-8111-111111111111";
const nextId = "22222222-2222-4222-8222-222222222222";
const snapshot: TapBoardSnapshot = { open: [], history: [] };

describe("tap board controlled state", () => {
  it("polls the board every thirty seconds", () => expect(TAP_BOARD_POLL_MS).toBe(30_000));
  it("keeps dirty sheet fields when a late board poll lands", () => {
    let state = openTapBoardSheet(snapshot, "tap", null);
    state = editTapBoardSheet(state, { tapNumber: "7", identity: "guest", guestLabel: "Dry cider", guestNominalBbl: "0.25" });
    const sheet = state.sheet;
    const polled = replaceTapBoardSnapshot(state, { open: [{ id, location_id: id, sku_id: null, label: "Other", nominal_bbl: .5, tap_number: null, opening_fill: 1, not_in_inventory: true, opened_at: "2026-09-08T12:00:00Z", opened_by: id, opened_by_label: "dana", brand_id: null, brand_name: null, sku_name: null }], history: [] });
    expect(polled.sheet).toBe(sheet);
    expect(polled.sheet?.fields).toMatchObject({ tapNumber: "7", guestLabel: "Dry cider", guestNominalBbl: "0.25" });
  });

  it("ignores an older refresh that resolves after a newer board result", async () => {
    const guard = createTapBoardRefreshGuard();
    let resolveOld!: (value: TapBoardSnapshot) => void;
    const old = guard.run(() => new Promise<TapBoardSnapshot>((resolve) => { resolveOld = resolve; }));
    const latest = { open: [], history: [{
      id, location_id: id, sku_id: null, label: "Closed", nominal_bbl: .5, tap_number: null,
      opening_fill: 1, not_in_inventory: true, opened_at: "2026-09-08T12:00:00Z", opened_by: id,
      opened_by_label: "dana", brand_id: null, brand_name: null, sku_name: null,
      closed_at: "2026-09-08T13:00:00Z", closed_by: id, closed_by_label: "dana",
      closing_fill: 0, close_reason: "Kicked empty",
    }] };
    const newer = guard.run(async () => latest);

    expect(await newer).toBe(latest);
    resolveOld(snapshot);
    expect(await old).toBeNull();
  });

  it("never defaults a guest swap to the outgoing identity", () => {
    const guest = { id, location_id: id, sku_id: null, label: "Cider", nominal_bbl: .5, tap_number: "7", opening_fill: 1, not_in_inventory: true, opened_at: "2026-09-08T12:00:00Z", opened_by: id, opened_by_label: "dana", brand_id: null, brand_name: null, sku_name: null };
    const state = openTapBoardSheet({ open: [guest], history: [] }, "swap", guest);
    expect(state.sheet?.fields.identity).toBe("guest");
    expect(() => beginTapBoardAttempt(state, nextId)).toThrow(/label and positive nominal/i);
  });

  it("freezes an uncertain payload and request through polls and every retry failure", () => {
    let state = openTapBoardSheet(snapshot, "tap", null);
    state = editTapBoardSheet(state, { tapNumber: "", identity: "guest", guestLabel: "Dry cider", guestNominalBbl: "0.25", openingFill: .6 });
    state = beginTapBoardAttempt(state, id);
    const frozen = state.sheet?.attempt.kind === "submitting" ? state.sheet.attempt : null;
    state = failTapBoardAttempt(state, null, "network failed", false);
    state = replaceTapBoardSnapshot(state, { open: [], history: [] });
    expect(state.sheet?.attempt).toMatchObject({ kind: "unknown", requestId: id, payload: frozen?.payload });
    expect(() => editTapBoardSheet(state, { guestLabel: "Changed" })).toThrow(/frozen/i);
    state = beginTapBoardAttempt(state, nextId);
    expect(state.sheet?.attempt).toMatchObject({ kind: "submitting", requestId: id, payload: frozen?.payload });
    state = failTapBoardAttempt(state, 409, "already closed", true);
    expect(state.sheet?.attempt).toMatchObject({ kind: "unknown", requestId: id, payload: frozen?.payload });
  });

  it("retires only a definitive first client refusal", () => {
    let state = openTapBoardSheet(snapshot, "tap", null);
    state = editTapBoardSheet(state, { identity: "guest", guestLabel: "Dry cider", guestNominalBbl: "0" });
    expect(() => beginTapBoardAttempt(state, id)).toThrow(/positive nominal/i);
    state = editTapBoardSheet(state, { guestNominalBbl: "0.25" });
    state = beginTapBoardAttempt(state, id);
    state = failTapBoardAttempt(state, 400, "invalid", false);
    expect(state.sheet?.attempt).toEqual({ kind: "error", message: "invalid" });
    expect(editTapBoardSheet(state, { guestLabel: "Pear cider" }).sheet?.fields).toMatchObject({ guestLabel: "Pear cider" });
  });

  it("retires a successful write even when the following refresh is definitively rejected", async () => {
    let state = openTapBoardSheet(snapshot, "tap", null);
    state = editTapBoardSheet(state, { identity: "guest", guestLabel: "Dry cider", guestNominalBbl: "0.25" });
    state = beginTapBoardAttempt(state, id);
    const write = vi.fn().mockResolvedValue({ id });
    const refreshRejection = Object.assign(new Error("forbidden"), { status: 403 });
    const result = await submitAndRefreshTapBoard(write, vi.fn().mockRejectedValue(refreshRejection));

    expect(result).toEqual({ kind: "saved", snapshot: null, refreshError: refreshRejection });
    if (result.kind === "saved") {
      expect(pollErrorAfterTapBoardSave("Automatic refresh failed.", result))
        .toBe("Tap action saved. Board refresh failed; reload when the connection returns.");
    }
    expect(write).toHaveBeenCalledOnce();
    state = completeTapBoardAttempt(state, result.kind === "saved" ? result.snapshot : null);
    expect(state).toEqual({ snapshot, sheet: null });
  });

  it("preserves a newer poll failure when an older post-write refresh is superseded", async () => {
    const guard = createTapBoardRefreshGuard();
    let resolvePostWrite!: (value: TapBoardSnapshot) => void;
    let postWriteStarted = false;
    const postWrite = submitAndRefreshTapBoard(
      vi.fn().mockResolvedValue({ id }),
      () => guard.run(() => new Promise<TapBoardSnapshot>((resolve) => {
        postWriteStarted = true;
        resolvePostWrite = resolve;
      })),
    );
    await vi.waitFor(() => expect(postWriteStarted).toBe(true));
    const automaticWarning = "Automatic refresh failed. Reload when the connection returns.";
    await expect(guard.run(async () => { throw new Error("poll failed"); })).rejects.toThrow("poll failed");
    resolvePostWrite(snapshot);
    const result = await postWrite;

    expect(result.kind).toBe("saved");
    if (result.kind === "saved") {
      expect(result).toMatchObject({ snapshot: null, refreshError: null });
      expect(pollErrorAfterTapBoardSave(automaticWarning, result)).toBe(automaticWarning);
      expect(pollErrorAfterTapBoardSave(automaticWarning, { ...result, snapshot })).toBeNull();
    }
  });
});
