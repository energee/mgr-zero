import { describe, expect, it } from "vitest";
import {
  beginCountAttempt,
  countBrandComparison,
  countDraftFromSnapshot,
  failCountAttempt,
  projectionMatchesCountDraft,
  projectionExpectedText,
  replaceCountProjection,
  replaceCountSnapshot,
  updateCountQuantity,
} from "@/lib/mgr/taproom-count-state";

const ids = {
  location: "00000000-0000-4000-8000-000000000001",
  bin: "00000000-0000-4000-8000-000000000002",
  sku: "00000000-0000-4000-8000-000000000003",
  lot: "00000000-0000-4000-8000-000000000004",
};
const snapshot = {
  location_id: ids.location,
  counted_on: "2026-09-08",
  prior_count: { id: "00000000-0000-4000-8000-000000000005", counted_on: "2026-09-01" },
  revision: "revision-one",
  lines: [
    { bin_id: ids.bin, bin_name: "Cold", sku_id: ids.sku, sku_name: "Hazy half", brand_id: "brand-hazy", brand_name: "Hazy", bbl_per_unit: .5, lot_id: ids.lot, qty_before: 4 },
    { bin_id: ids.bin, bin_name: "Cold", sku_id: ids.sku, sku_name: "Hazy half", brand_id: "brand-hazy", brand_name: "Hazy", bbl_per_unit: .5, lot_id: null, qty_before: 2 },
  ],
};

describe("taproom count controlled state", () => {
  it("keeps exact bucket identity and the original revision through edits and a separate projection refresh", () => {
    let state = countDraftFromSnapshot(snapshot, { expected_bbl: null, reason: "no_pos_coverage" });
    const keys = state.draft.lines.map((line) => line.key);
    state = updateCountQuantity(state, keys[0], "3");
    state = updateCountQuantity(state, keys[1], "0");
    state = replaceCountProjection(state, { expected_bbl: 1.5, reason: null });

    expect(state.draft).toMatchObject({ locationId: ids.location, countedOn: "2026-09-08", revision: "revision-one" });
    expect(state.draft.lines.map((line) => ({ key: line.key, binId: line.binId, skuId: line.skuId, lotId: line.lotId, quantity: line.quantity })))
      .toEqual([
        { key: keys[0], binId: ids.bin, skuId: ids.sku, lotId: ids.lot, quantity: "3" },
        { key: keys[1], binId: ids.bin, skuId: ids.sku, lotId: null, quantity: "0" },
      ]);
  });

  it("freezes an unknown attempt and retries its exact request ID and payload", () => {
    let state = countDraftFromSnapshot(snapshot, null);
    for (const line of state.draft.lines) state = updateCountQuantity(state, line.key, String(line.qtyBefore));
    state = beginCountAttempt(state, "00000000-0000-4000-8000-000000000006");
    const frozen = state.attempt;
    state = failCountAttempt(state, "unknown", "No response received");
    const unknown = state.attempt;
    state = replaceCountProjection(state, {
      expected_bbl: 1,
      prior_count: {
        id: "00000000-0000-4000-8000-000000000099",
        counted_on: "2026-09-08",
        created_at: "2026-09-08T23:00:00Z",
      },
    });

    expect(projectionMatchesCountDraft(state)).toBe(false);
    expect(state.attempt).toEqual(unknown);
    state = updateCountQuantity(state, state.draft.lines[0].key, "1");
    state = beginCountAttempt(state, "00000000-0000-4000-8000-000000000007");

    expect(state.attempt).toEqual(frozen);
  });

  it("makes stale state explicit and starts a blank recount from a fresh revision", () => {
    let state = countDraftFromSnapshot(snapshot, null);
    for (const line of state.draft.lines) state = updateCountQuantity(state, line.key, "0");
    state = beginCountAttempt(state, "00000000-0000-4000-8000-000000000006");
    state = failCountAttempt(state, "stale", "Stock changed while you counted");
    expect(state.attempt).toMatchObject({ kind: "stale" });
    const stale = state;
    state = updateCountQuantity(state, state.draft.lines[0].key, "1");
    expect(state).toBe(stale);
    expect(state.attempt).toMatchObject({ kind: "stale" });

    const fresh = { ...snapshot, revision: "revision-two", lines: snapshot.lines.map((line) => ({ ...line, qty_before: 3 })) };
    state = replaceCountSnapshot(state, fresh);
    expect(state.attempt).toEqual({ kind: "idle" });
    expect(state.draft.revision).toBe("revision-two");
    expect(state.draft.lines.map((line) => line.quantity)).toEqual(["", ""]);
  });

  it("preserves the captured prior count through aligned projection refresh and rejects a newer baseline", () => {
    const aligned = { prior_count: { ...snapshot.prior_count!, created_at: "2026-09-01T23:00:00Z" }, expected_bbl: 1, rows: [] };
    let state = countDraftFromSnapshot(snapshot, aligned);
    state = updateCountQuantity(state, state.draft.lines[0].key, "3");
    state = replaceCountProjection(state, { ...aligned, expected_bbl: 2, as_of: "2026-09-08T22:00:00Z" });
    expect(state.draft.priorCount).toEqual(snapshot.prior_count);
    expect(state.draft.revision).toBe("revision-one");
    expect(state.draft.lines[0].quantity).toBe("3");
    expect(projectionMatchesCountDraft(state)).toBe(true);

    state = replaceCountProjection(state, { ...aligned, prior_count: { id: "00000000-0000-4000-8000-000000000099", counted_on: "2026-09-08", created_at: "2026-09-08T23:00:00Z" } });
    expect(projectionMatchesCountDraft(state)).toBe(false);
    expect(state.attempt).toMatchObject({ kind: "stale" });
    expect(state.draft.priorCount).toEqual(snapshot.prior_count);
    expect(state.draft.lines[0].quantity).toBe("3");
  });

  it("requires every bucket explicitly and refuses fractions and overcounts before a request exists", () => {
    let state = countDraftFromSnapshot(snapshot, null);
    state = updateCountQuantity(state, state.draft.lines[0].key, "4");
    expect(() => beginCountAttempt(state, crypto.randomUUID())).toThrow(/every displayed bucket/);
    state = updateCountQuantity(state, state.draft.lines[1].key, "1.5");
    expect(() => beginCountAttempt(state, crypto.randomUUID())).toThrow(/whole packaged units/);
    state = updateCountQuantity(state, state.draft.lines[1].key, "3");
    expect(() => beginCountAttempt(state, crypto.randomUUID())).toThrow(/exceeds recorded stock/);
  });

  it("keeps unavailable expected consumption blank while preserving a proven zero", () => {
    expect(projectionExpectedText({ expected_bbl: null })).toBeNull();
    expect(projectionExpectedText({ expected_bbl: 0 })).toBe("0 bbl expected");
  });

  it("groups explicitly entered package depletion by brand and keeps an incomplete draft blank", () => {
    const multiSku = { ...snapshot, lines: [...snapshot.lines,
      { ...snapshot.lines[0], sku_id: "00000000-0000-4000-8000-000000000007", sku_name: "Hazy case", lot_id: null, qty_before: 5, bbl_per_unit: .0645 },
    ] };
    const projection = { expected_bbl: 1.0645, coverage_complete: true, unmapped_lines: 0,
      rows: [{ brand_id: "brand-hazy", brand_name: "Hazy", expected_bbl: 1.0645 }] };
    let state = countDraftFromSnapshot(multiSku, projection);
    expect(countBrandComparison(state)).toEqual([{ brandId: "brand-hazy", brandName: "Hazy", expectedBbl: 1.0645,
      actualBbl: null, differenceBbl: null, complete: false }]);
    const quantities = ["3", "2", "4"];
    state.draft.lines.forEach((line, index) => { state = updateCountQuantity(state, line.key, quantities[index]); });
    expect(countBrandComparison(state)).toEqual([{ brandId: "brand-hazy", brandName: "Hazy", expectedBbl: 1.0645,
      actualBbl: .5645, differenceBbl: .5, complete: true }]);
    const refreshed = replaceCountProjection(state, { ...projection, expected_bbl: 1.5, rows: [{ ...projection.rows[0], expected_bbl: 1.5 }] });
    expect(refreshed.draft).toEqual(state.draft);
    expect(countBrandComparison(refreshed)[0]).toMatchObject({ actualBbl: .5645, differenceBbl: .9355 });
  });
});
