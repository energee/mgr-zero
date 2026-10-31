import { describe, expect, it } from "vitest";
import { transferDetailSubmitted } from "../lib/mgr/fixtures/transfers";
import { toTransferDetailViewProps, transferReceiveSources, transferSourceQty, type TransferSourceLine } from "../lib/mgr/transfer-detail-view";
import { toTransfersViewProps } from "../lib/mgr/transfers-view";

describe("transfer lifecycle", () => {
  it.each(["submitted", "picked", "in_transit"])("keeps %s transfers receivable", status => {
    const model = toTransferDetailViewProps({ ...transferDetailSubmitted, transfer: { ...transferDetailSubmitted.transfer, status } });
    expect(model.nextVerb).toBeDefined();
    expect(model.received).toBe(false);
  });

  it.each(["received", "cancelled"])("removes the next action from %s transfers in both list and detail", status => {
    const transfer = { ...transferDetailSubmitted.transfer, status, cancel_reason: status === "cancelled" ? "Wrong destination" : null };
    const detail = toTransferDetailViewProps({ ...transferDetailSubmitted, transfer });
    const list = toTransfersViewProps({ transfers: [{ ...transfer, line_count: 2 }] });
    expect(detail.nextVerb).toBeUndefined();
    expect(list.rows[0].verb).toBeUndefined();
    expect(detail.received).toBe(status === "received");
  });
});

describe("transfer source allocation", () => {
  it("prefills only a sole source and preserves explicit clearing and zero", () => {
    expect(transferSourceQty(undefined, 1, 2.5)).toBe("2.5");
    expect(transferSourceQty(undefined, 2, 2.5)).toBe("");
    expect(transferSourceQty(undefined, 0, 2.5)).toBe("");
    expect(transferSourceQty("", 1, 2.5)).toBe("");
    expect(transferSourceQty("0", 1, 2.5)).toBe("0");
    expect(transferSourceQty(undefined, 1, 0)).toBe("0");
  });

  it("preserves split-lot and untracked identity without allocating blank quantities", () => {
    const lines = transferDetailSubmitted.sources!;
    expect(transferReceiveSources(lines, {})).toEqual([
      { lineId: "l1", sources: [{ lotId: "lot-hazy", qty: 2 }] },
      { lineId: "l2", sources: [] },
    ]);
    const received = transferReceiveSources(lines, { l1: { "lot-hazy": "" }, l2: { "lot-pils": "3.5", "": "0.5" } });
    expect(received).toEqual([
      { lineId: "l1", sources: [] },
      { lineId: "l2", sources: [{ lotId: "lot-pils", qty: 3.5 }, { lotId: null, qty: 0.5 }] },
    ]);
  });

  it("isolates the same lot on separate lines and retains four-decimal material quantities", () => {
    const source = { lotId: "same-lot", name: "Malt", lotCode: "M-1", qty: 10 };
    const lines: TransferSourceLine[] = [
      { id: "first", qty: 1.2345, step: 0.0001, sources: [source] },
      { id: "second", qty: 2.3456, step: 0.0001, sources: [source] },
    ];
    const quantities = { first: { "same-lot": "0.1234", removed: "99" }, second: { "same-lot": "0" }, removed: { "same-lot": "99" } };
    const before = structuredClone({ lines, quantities });
    expect(transferReceiveSources(lines, quantities)).toEqual([
      { lineId: "first", sources: [{ lotId: "same-lot", qty: 0.1234 }] },
      { lineId: "second", sources: [] },
    ]);
    expect({ lines, quantities }).toEqual(before);
    expect(transferReceiveSources(lines, {})[1].sources[0].qty).toBe(2.3456);
  });
});
