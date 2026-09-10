import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";
import { ComposerProposalView, ComposerQuestionView, ComposerStripView } from "@/components/mgr/views/composer";
import { canRun, runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import {
  beginComposerCommit,
  composerActions,
  composerInitialState,
  editMovementDraft,
  movementFormHref,
  movementQuestion,
  receiveProposal,
  resetComposerScope,
  toMovementInput,
} from "@/lib/composer/state";

const ids = {
  skuId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  binId: "33333333-3333-4333-8333-333333333333",
  channelId: "44444444-4444-4444-8444-444444444444",
};

describe("structured composer state", () => {
  it("asks for every risky blank and never creates a commit from a question", () => {
    let state = composerInitialState("actor:brewery:admin");
    expect(movementQuestion(state.draft)).toMatchObject({ field: "skuId", prompt: expect.stringMatching(/SKU|package/i) });

    state = editMovementDraft(state, { skuId: ids.skuId, kind: "adjustment" });
    expect(movementQuestion(state.draft)?.field).toBe("direction");
    state = editMovementDraft(state, { direction: "remove", locationId: ids.locationId });
    expect(movementQuestion(state.draft)?.field).toBe("binId");
    state = editMovementDraft(state, { binId: ids.binId, lotChoice: "untracked", qty: "0.5" });
    expect(movementQuestion(state.draft)).toBeNull();
    expect(beginComposerCommit(state)).toMatchObject({ envelope: null });
  });

  it("derives the signed registered input, invalidates edited previews, and emits one explicit commit", () => {
    let state = composerInitialState("actor:brewery:admin");
    state = editMovementDraft(state, {
      ...ids,
      kind: "depletion",
      lotChoice: "untracked",
      qty: "1",
      saleChannelId: ids.channelId,
    });
    expect(toMovementInput(state.draft)).toEqual({
      skuId: ids.skuId,
      locationId: ids.locationId,
      binId: ids.binId,
      qty: -1,
      type: "depletion",
      saleChannelId: ids.channelId,
    });

    state = receiveProposal(state, {
      name: "record_movement",
      input: toMovementInput(state.draft)!,
      previewToken: "55555555-5555-4555-8555-555555555555",
      effects: [{ label: "Hazy IPA case · Taproom · Walk-in", qty: "-1" }],
      warnings: [],
    }, "66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777");

    const first = beginComposerCommit(state);
    expect(first.envelope).toMatchObject({ name: "record_movement", requestId: "77777777-7777-4777-8777-777777777777" });
    expect(beginComposerCommit(first.state).envelope).toBeNull();

    const edited = editMovementDraft(state, { qty: "2" });
    expect(edited.proposal).toBeNull();
    expect(edited.commitRequestId).toBeNull();
  });

  it("preserves known fields when opening the ordinary movement form", () => {
    const href = movementFormHref({
      skuId: ids.skuId,
      locationId: ids.locationId,
      binId: ids.binId,
      qty: -0.5,
      type: "depletion",
      saleChannelId: ids.channelId,
      note: "Festival tent",
    });
    const url = new URL(href, "https://mgr.test");
    expect(url.pathname).toBe("/inventory");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      recordMovement: "1",
      skuId: ids.skuId,
      locationId: ids.locationId,
      binId: ids.binId,
      qty: "-0.5",
      type: "depletion",
      saleChannelId: ids.channelId,
      note: "Festival tent",
    });
  });

  it("denies composer and history operations to customers and does not mount a portal composer", async () => {
    expect(composerActions("customer")).toEqual([]);
    expect(composerActions("sales").flatMap((action) => action.queries)).toEqual(["list_skus", "get_atp"]);
    const customer = { breweryId: ids.locationId, userId: ids.skuId, customerId: ids.binId, role: "customer" } as Parameters<typeof canRun>[0];
    for (const name of ["preview_command", "create_chat_conversation", "append_chat_message", "list_chat_conversations", "get_chat_history"]) {
      expect(canRun(customer, name), name).toBe(false);
      await expect(runCommand(name, {}, customer), name).rejects.toMatchObject({ status: 403, code: "permission_denied" });
    }
    expect(readFileSync("app/(portal)/layout.tsx", "utf8")).not.toMatch(/Composer|composer=/);
    expect(readFileSync("components/mgr/screen-frame.tsx", "utf8")).not.toContain("E.comp(true)");

    const populated = {
      ...composerInitialState("actor-a:brewery-a:admin"),
      historyOpen: true,
      history: [{ id: "message", role: "assistant" as const, content: "private answer", created_at: "now" }],
    };
    expect(resetComposerScope(populated, "actor-b:brewery-b:admin")).toEqual(composerInitialState("actor-b:brewery-b:admin"));
  });

  it("shares structured composer views with the staff shell and filters shell actions by persona role", () => {
    expect(E.comp().type).toBe(ComposerStripView);
    const live = readFileSync("components/mgr/composer.tsx", "utf8");
    expect(live).toContain("<ComposerMovementPickerView");
    expect(readFileSync("app/(app)/layout.tsx", "utf8")).toMatch(/composer=\{<Composer[^>]+role=/);
    expect(readFileSync("components/mgr/screen-frame.tsx", "utf8")).toContain("composer={E.comp(persona.role)}");
    expect(composerActions("admin").map((action) => action.id)).toEqual(["record_movement", "read_atp"]);
    expect(composerActions("sales").map((action) => action.id)).toEqual(["read_atp"]);
    expect(composerActions("brewer")).toEqual([]);
  });

  it("renders reachable structured picker states and proposals only from canonical effect fields", () => {
    const question = renderToStaticMarkup(createElement(ComposerQuestionView, { prompt: "Which package?" }));
    expect(question).not.toContain("Commit movement");
    const questionScreen = renderToStaticMarkup(createElement("div", null, SCREENS.find((screen) => screen.name === "Composer question")!.body));
    const proposalScreen = renderToStaticMarkup(createElement("div", null, SCREENS.find((screen) => screen.name === "Composer proposal")!.body));
    for (const label of ["SKU / package", "Type", "Location", "Bin", "Lot", "Positive quantity"]) {
      expect(questionScreen, label).toContain(label);
      expect(proposalScreen, label).toContain(label);
    }
    expect(questionScreen).not.toContain("Blew a half");
    expect(proposalScreen).not.toContain("Blew a half");
    const proposal = renderToStaticMarkup(createElement(ComposerProposalView, {
      effects: [{ label: "Canonical IPA · Taproom · Cold", qty: "-1", stockBeforeQty: "4", stockAfterQty: "3" }],
      warnings: ["Registration needs review"],
      onCommit: () => undefined,
    }));
    expect(proposal).toContain("Canonical IPA");
    expect(proposal).toContain("selected stock 4 to 3");
    expect(proposal).toContain("Registration needs review");
    expect(proposal).not.toContain("previewToken");
  });
});
