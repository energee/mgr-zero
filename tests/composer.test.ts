import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { SCREENS } from "@/components/mgr/screens";
import { ComposerAnswerView, ComposerProposalView, ComposerQuestionView, ComposerStripView } from "@/components/mgr/views/composer";
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

  it("limits customer reads to portal operations and clears rendered state on scope change", () => {
    expect(composerActions("customer").flatMap((action) => action.queries)).toEqual(["portal_catalog"]);
    expect(composerActions("sales").flatMap((action) => action.queries)).toEqual(["list_skus", "get_atp"]);

    const populated = {
      ...composerInitialState("actor-a:brewery-a:admin"),
      historyOpen: true,
      history: [{ id: "message", role: "assistant" as const, content: "private answer", created_at: "now" }],
    };
    expect(resetComposerScope(populated, "actor-b:brewery-b:admin")).toEqual(composerInitialState("actor-b:brewery-b:admin"));
  });

  it("shares the composer views between inventory records and both live shells", () => {
    expect(E.comp().type).toBe(ComposerStripView);
    const bodyFor = (name: string) => {
      const body = SCREENS.find((screen) => screen.name === name)?.body;
      return isValidElement(body) ? body.type : null;
    };
    expect(bodyFor("Composer question")).toBe(ComposerQuestionView);
    expect(bodyFor("Composer proposal")).toBe(ComposerProposalView);
    expect(bodyFor("Composer answer")).toBe(ComposerAnswerView);
    for (const file of ["app/(app)/layout.tsx", "app/(portal)/layout.tsx"]) {
      expect(readFileSync(file, "utf8")).toMatch(/composer=\{<Composer[^>]+role=/);
    }
  });

  it("renders questions without a commit and proposals only from canonical effect fields", () => {
    const question = renderToStaticMarkup(createElement(ComposerQuestionView, { prompt: "Which package?" }));
    expect(question).not.toContain("Commit movement");
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
