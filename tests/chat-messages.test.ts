import { afterEach, describe, expect, it, vi } from "vitest";
import { composerMessageText, latestComposerProposal, PROPOSAL_ERROR } from "@/lib/chat/messages";

const input = {
  skuId: "00000000-0000-4000-8000-000000000001", locationId: "00000000-0000-4000-8000-000000000002",
  binId: "00000000-0000-4000-8000-000000000003", qty: -1, type: "loss",
};
const awaitingPart = (proposal: unknown) => ({ type: "tool-record_movement", state: "output-available", output: { status: "awaiting_confirmation", proposal } });
const awaiting = (proposal: unknown) => [{ role: "assistant", parts: [awaitingPart(proposal)] }];

// One effect as preview_inventory_movement builds it (20260924030000): every
// key present, and jsonb_build_object writes a null operand as JSON null.
const rpcEffect = {
  label: "IPA · Cold room · A1", qty: "-1", bbl: null, stockBeforeQty: "4", stockAfterQty: "3",
  stockBeforeBbl: null, stockAfterBbl: null, type: "loss", taxTreatment: null, destinationState: null, correction: "reverse_inventory_movement",
};

describe("composer UI messages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("joins streamed text parts and ignores reasoning", () => {
    expect(composerMessageText({ parts: [{ type: "text", text: "Current " }, { type: "reasoning", text: "hidden" }, { type: "text", text: "stock." }] })).toBe("Current stock.");
  });

  it("finds the latest server proposal tool output", () => {
    expect(latestComposerProposal(awaiting({ name: "record_movement", input, effects: [rpcEffect], warnings: [], version: {}, previewToken: "token" })))
      .toMatchObject({ proposal: { name: "record_movement", input: { qty: -1 }, previewToken: "token" } });
  });

  it("reports no proposal when none is awaiting", () => {
    expect(latestComposerProposal([{ role: "assistant", parts: [{ type: "text", text: "Hi" }] }])).toEqual({ proposal: null });
  });

  // The proposal crosses a trust boundary (server tool output, relayed through
  // the model stream). A shape the drawer cannot render returns an operator
  // message instead of a proposal, so it never reaches the commit button, and
  // never throws out of the staff layout's render (#463).
  it.each([
    ["another command", { name: "update_sku", input, effects: [], warnings: [], previewToken: "token" }],
    ["an invalid movement input", { name: "record_movement", input: { qty: -1 }, effects: [], warnings: [], previewToken: "token" }],
    ["a missing preview token", { name: "record_movement", input, effects: [], warnings: [] }],
    ["malformed effects", { name: "record_movement", input, effects: [{ qty: -1 }], warnings: [], previewToken: "token" }],
  ])("rejects %s with a plain message and logs the detail", (_, proposal) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(latestComposerProposal(awaiting(proposal))).toEqual({ proposal: null, error: PROPOSAL_ERROR });
    expect(PROPOSAL_ERROR).not.toMatch(/✖|→/);
    expect(log).toHaveBeenCalled();
  });

  it("drops a malformed proposal once a later assistant turn follows it", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const messages = [
      ...awaiting({ name: "update_sku" }),
      { role: "user", parts: [{ type: "text", text: "Never mind, what is on tap?" }] },
      { role: "assistant", parts: [{ type: "text", text: "Hazy IPA and Pils." }] },
    ];
    expect(latestComposerProposal(messages)).toEqual({ proposal: null });
  });
});
