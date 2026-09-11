import { describe, expect, it } from "vitest";
import { composerMessageText, latestComposerProposal } from "@/lib/chat/messages";

describe("composer UI messages", () => {
  it("joins streamed text parts and ignores reasoning", () => {
    expect(composerMessageText({ parts: [{ type: "text", text: "Current " }, { type: "reasoning", text: "hidden" }, { type: "text", text: "stock." }] })).toBe("Current stock.");
  });

  it("finds the latest server proposal tool output", () => {
    expect(latestComposerProposal([{ parts: [{ type: "tool-record_movement", state: "output-available", output: {
      status: "awaiting_confirmation", proposal: { name: "record_movement", input: { qty: -1 }, effects: [], warnings: [], version: {}, previewToken: "token" },
    } }] }])).toMatchObject({ name: "record_movement", input: { qty: -1 }, previewToken: "token" });
  });
});
