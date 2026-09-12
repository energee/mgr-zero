import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { ComposerConversationView, ComposerDrawerView, ComposerProposalView } from "@/components/mgr/views/composer";
import { chatModelFromSettings, gatewayLanguageModels } from "@/lib/chat/models";
import { canRun } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { movementFormHref, movementFormInstanceKey } from "@/lib/composer/state";
import { isComposerShortcut } from "@/components/mgr/composer";

const ids = {
  skuId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  binId: "33333333-3333-4333-8333-333333333333",
};

describe("AI composer", () => {
  it("ignores keydown-like events without a key", () => {
    expect(isComposerShortcut({ metaKey: true })).toBe(false);
    expect(isComposerShortcut({ key: "K", ctrlKey: true })).toBe(true);
  });

  it("uses the saved brewery model and safely falls back", () => {
    expect(chatModelFromSettings({ ai_model: "openai/gpt-5.4" }, "anthropic/claude-sonnet-4.5")).toBe("openai/gpt-5.4");
    expect(chatModelFromSettings({ ai_model: "not a gateway model" }, "anthropic/claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
    expect(chatModelFromSettings(null, "anthropic/claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
  });

  it("offers every language model returned by Gateway", () => {
    expect(gatewayLanguageModels([
      { id: "openai/gpt-5.4", name: "GPT-5.4", modelType: "language" },
      { id: "google/veo", name: "Veo", modelType: "video" },
      { id: "anthropic/claude", name: "Claude", modelType: null },
    ])).toEqual([
      { id: "anthropic/claude", name: "Claude" },
      { id: "openai/gpt-5.4", name: "GPT-5.4" },
    ]);
  });

  it("renders model selection as a shared Settings control", () => {
    const html = renderToStaticMarkup(createElement(AiModelSettingsView, {
      value: "openai/gpt-5.4",
      models: [{ id: "openai/gpt-5.4", name: "GPT-5.4" }],
    }));
    expect(html).toContain("AI model");
    expect(html).toContain("GPT-5.4");
    expect(html).toContain('data-slot="select-trigger"');
    expect(readFileSync("components/mgr/views/ai-model-settings.tsx", "utf8")).not.toMatch(/<select\b/);
    expect(html).toContain("Save AI model");
  });

  it("shows the brewery model in the conversation header", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, { messages: [], model: "openai/gpt-5.4" }));
    expect(html).toContain("openai/gpt-5.4");
  });

  it("renders assistant markdown", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [{ id: "answer", role: "assistant", content: "1. **First**\n2. Second" }],
    }));
    expect(html).toContain("<ol");
    expect(html).toContain('data-streamdown="strong">First</span>');
  });

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
    expect(E.comp().type).toBe(ComposerDrawerView);
    const live = readFileSync("components/mgr/composer.tsx", "utf8");
    expect(live).toContain("useChat");
    expect(live).not.toMatch(/normalized\.includes|ComposerMovementPickerView|chooseAction/);
    expect(readFileSync("app/(app)/layout.tsx", "utf8")).toMatch(/composer=\{<Composer[^>]+role=/);
    expect(readFileSync("components/mgr/screen-frame.tsx", "utf8")).toContain("composer={E.comp(persona.role)}");
    const shared = readFileSync("components/mgr/views/composer.tsx", "utf8");
    const drawer = readFileSync("components/mgr/views/composer-drawer.tsx", "utf8");
    const drawerPrimitive = readFileSync("components/ui/drawer.tsx", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> };
    expect(shared).toMatch(/export \{ ComposerDrawerView \} from/);
    expect(drawer).toContain('const MINIMIZED = "44px"');
    expect(drawer).toContain('const COMPACT = "480px"');
    expect(drawer).toContain("const EXPANDED = 1");
    expect(drawer).toContain('const minimized = isMobile ? "92px" : MINIMIZED');
    expect(drawer).toMatch(/<Drawer[\s\S]*\bopen\b[\s\S]*snapPoints=\{\[minimized, COMPACT, EXPANDED\]\}/);
    expect(drawer).toContain("modal={false}");
    expect(drawer).toContain("disablePointerDismissal");
    expect(drawer).toContain("snapToSequentialPoints");
    expect(drawer).toContain("snapPoint={snapPoint}");
    expect(drawer).toContain("onSnapPointChange={setSnapPoint}");
    expect(drawer).toContain("handle={<div");
    expect(drawer).toContain("pointer-events-none");
    expect(drawer).toContain('addEventListener("pointerup"');
    expect(drawer).not.toContain("handleOnly");
    expect(drawer).not.toContain("DrawerTrigger");
    expect(drawer).toContain('"Expand Ask MGR"');
    expect(drawer).toContain('"Minimize Ask MGR"');
    expect(drawer).toContain('"Open Ask MGR"');
    expect(shared).toContain('className="flex min-h-0 flex-1 flex-col overflow-hidden"');
    expect(shared).not.toContain(">Minimize</Button>");
    expect(readFileSync("components/mgr/app-shell.tsx", "utf8")).toContain('className="h-11 shrink-0"');
    expect(drawerPrimitive).toContain('from "@base-ui/react/drawer"');
    expect(drawerPrimitive).toMatch(/\{handle\}[\s\S]*<DrawerPrimitive\.Content/);
    expect(drawerPrimitive).toContain("transform-[translate3d(0,var(--drawer-snap-point-offset,0px),0)]");
    expect(drawerPrimitive).not.toContain('from "vaul"');
    expect(packageJson.dependencies).toHaveProperty("@base-ui/react");
    expect(packageJson.dependencies).not.toHaveProperty("vaul");
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
