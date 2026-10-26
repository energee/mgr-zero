import { describe, expect, it } from "vitest";
import { deliveryOutcomeState } from "@/lib/mgr/confirm-delivery-view";

const lines = [{ key: "kegs", title: "Fictional IPA", qty: "2" }];
const draft = { refused: {}, signedBy: "Pat", reason: "customer_refused", note: "", transferRefused: false };

describe("delivery refusal draft (#1386)", () => {
  it.each(["-1", "3", "0.5", "1.0", "1e0", "2E0", "", "+1", "NaN", "Infinity", "9007199254740992"])("rejects %s without an impossible Accepted count", (value) => {
    const state = deliveryOutcomeState(lines, { ...draft, refused: { kegs: value } });
    expect(state.rows[0]).toMatchObject({ value, accepted: null, error: expect.stringContaining("0 to 2") });
    expect(state.reason).not.toBeNull();
    expect(state.refused).toEqual([]);
    expect(state.fullRefusal).toBe(false);
  });

  it.each([undefined, "0"])("preserves no-refusal semantics for %s", value => {
    const state = deliveryOutcomeState(lines, { ...draft, refused: value === undefined ? {} : { kegs: value }, reason: "" });
    expect(state.rows[0]).toMatchObject({ value: "0", accepted: 2, error: undefined });
    expect(state).toMatchObject({ refused: [], hasRefusal: false, fullRefusal: false, reason: null });
  });

  it("requires Received by for accepted beer, including partial refusals", () => {
    expect(deliveryOutcomeState(lines, { ...draft, signedBy: " " }).reason).toContain("Received by");
    const state = deliveryOutcomeState(lines, { ...draft, signedBy: "", refused: { kegs: "1" } });
    expect(state).toMatchObject({ refused: [{ orderLineId: "kegs", qty: 1 }], hasRefusal: true, fullRefusal: false });
    expect(state.reason).toContain("Received by");
    expect(state.rows[0].accepted).toBe(1);
  });

  it("permits full refusal without a receiver, but still requires its reason and other note", () => {
    const full = { ...draft, signedBy: "", refused: { kegs: "2" } };
    expect(deliveryOutcomeState(lines, full)).toMatchObject({ fullRefusal: true, reason: null, refused: [{ orderLineId: "kegs", qty: 2 }] });
    expect(deliveryOutcomeState(lines, { ...full, reason: "" }).reason).toContain("refusal reason");
    expect(deliveryOutcomeState(lines, { ...full, reason: "other" }).reason).toContain("refusal note");
    expect(deliveryOutcomeState(lines, { ...full, reason: "other", note: "Wrong address" }).reason).toBeNull();
  });

  it("requires every line to be valid and fully refused before omitting Received by", () => {
    const two = [...lines, { key: "cases", title: "Fictional cases", qty: "3" }];
    expect(deliveryOutcomeState(two, { ...draft, signedBy: "", refused: { kegs: "2", cases: "4" } })).toMatchObject({ fullRefusal: false, reason: expect.any(String) });
    expect(deliveryOutcomeState(two, { ...draft, signedBy: "", refused: { kegs: "2", cases: "3" } })).toMatchObject({ fullRefusal: true, reason: null });
  });

  it("preserves transfer refusal and receipt requirements", () => {
    expect(deliveryOutcomeState(lines, { ...draft, signedBy: "" }, true).reason).toContain("Received by");
    expect(deliveryOutcomeState(lines, { ...draft, signedBy: "", transferRefused: true }, true)).toMatchObject({ fullRefusal: true, hasRefusal: true, reason: null, refused: [] });
  });
});
