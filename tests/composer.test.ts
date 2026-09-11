import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { ComposerProposalView, ComposerStripView } from "@/components/mgr/views/composer";
import { canRun } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { movementFormHref, movementFormInstanceKey } from "@/lib/composer/state";

const ids = {
  skuId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  binId: "33333333-3333-4333-8333-333333333333",
};

describe("AI composer", () => {
  it("preserves known fields when opening the ordinary movement form", () => {
    const handoffId = "88888888-8888-4888-8888-888888888888";
    const href = movementFormHref({ ...ids, qty: -0.5, type: "depletion", note: "Festival tent" }, handoffId);
    const url = new URL(href, "https://mgr.test");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ recordMovement: "1", ...ids, qty: "-0.5", type: "depletion", note: "Festival tent", movementHandoff: handoffId });
    expect(movementFormInstanceKey()).toBe("manual");
    expect(readFileSync("app/(app)/inventory/page.tsx", "utf8")).toContain("key={movementFormInstanceKey(handoffId)}");
  });

  it("keeps chat and history staff-only", () => {
    const customer = { breweryId: ids.locationId, userId: ids.skuId, customerId: ids.binId, role: "customer" } as Parameters<typeof canRun>[0];
    for (const name of ["create_chat_conversation", "append_chat_message", "list_chat_conversations", "get_chat_history"]) expect(canRun(customer, name)).toBe(false);
    expect(readFileSync("app/(portal)/layout.tsx", "utf8")).not.toMatch(/Composer|composer=/);
  });

  it("shares the AI SDK composer between live and inventory surfaces", () => {
    expect(E.comp().type).toBe(ComposerStripView);
    const strip = renderToStaticMarkup(createElement(ComposerStripView));
    for (const text of ["Ask MGR", "Send", "Record a movement"]) expect(strip).toContain(text);
    const live = readFileSync("components/mgr/composer.tsx", "utf8");
    expect(live).toContain("useChat");
    expect(live).not.toMatch(/normalized\.includes|ComposerMovementPickerView|chooseAction/);
    expect(readFileSync("app/(app)/layout.tsx", "utf8")).toMatch(/composer=\{<Composer[^>]+role=/);
    expect(readFileSync("components/mgr/screen-frame.tsx", "utf8")).toContain("composer={E.comp(persona.role)}");
  });

  it("renders only canonical proposal effects", () => {
    const proposal = renderToStaticMarkup(createElement(ComposerProposalView, {
      effects: [{ label: "Canonical IPA · Taproom · Cold", qty: "-1", stockBeforeQty: "4", stockAfterQty: "3" }],
      warnings: ["Registration needs review"], onCommit: () => undefined,
    }));
    expect(proposal).toContain("Canonical IPA");
    expect(proposal).toContain("selected stock 4 to 3");
    expect(proposal).not.toContain("previewToken");
  });
});
