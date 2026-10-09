import { describe, expect, it } from "vitest";
import { composerMessageText, latestComposerProposal } from "@/lib/chat/messages";

const input = {
  skuId: "00000000-0000-4000-8000-000000000001", locationId: "00000000-0000-4000-8000-000000000002",
  binId: "00000000-0000-4000-8000-000000000003", qty: -1, type: "loss",
};
const awaiting = (proposal: unknown) => [{ parts: [{ type: "tool-record_movement", state: "output-available", output: { status: "awaiting_confirmation", proposal } }] }];

describe("composer UI messages", () => {
  it("joins streamed text parts and ignores reasoning", () => {
    expect(composerMessageText({ parts: [{ type: "text", text: "Current " }, { type: "reasoning", text: "hidden" }, { type: "text", text: "stock." }] })).toBe("Current stock.");
  });

  it("finds the latest server proposal tool output", () => {
    expect(latestComposerProposal(awaiting({ name: "record_movement", input, effects: [{ label: "IPA · Cold room · A1", qty: "-1", taxTreatment: null }], warnings: [], version: {}, previewToken: "token" })))
      .toMatchObject({ name: "record_movement", input: { qty: -1 }, previewToken: "token" });
  });

  // The proposal crosses a trust boundary (server tool output, relayed through
  // the model stream). A shape the drawer cannot render must fail loudly, not
  // reach movementFormHref or the commit button as a lie.
  it.each([
    ["another command", { name: "update_sku", input, effects: [], warnings: [], previewToken: "token" }],
    ["an invalid movement input", { name: "record_movement", input: { qty: -1 }, effects: [], warnings: [], previewToken: "token" }],
    ["a missing preview token", { name: "record_movement", input, effects: [], warnings: [] }],
    ["malformed effects", { name: "record_movement", input, effects: [{ qty: -1 }], warnings: [], previewToken: "token" }],
  ])("rejects %s", (_, proposal) => {
    expect(() => latestComposerProposal(awaiting(proposal))).toThrow(/Composer proposal/);
  });
});
