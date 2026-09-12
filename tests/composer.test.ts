import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { AiModelIcon } from "@/components/mgr/ai-model-icon";
import { AiModelSettingsView } from "@/components/mgr/views/ai-model-settings";
import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { ComposerConversationView, ComposerDrawerView, ComposerProposalView } from "@/components/mgr/views/composer";
import { chatModelFromSettings, gatewayLanguageModels, modelMatches, modelProvider } from "@/lib/chat/models";
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
      { id: "openai/gpt-5.4", name: "GPT-5.4", modelType: "language", pricing: { input: "0.0000025", output: "0.000015" } },
      { id: "google/veo", name: "Veo", modelType: "video" },
      { id: "anthropic/claude", name: "Claude", modelType: null },
    ])).toEqual([
      { id: "anthropic/claude", name: "Claude" },
      { id: "openai/gpt-5.4", name: "GPT-5.4", pricing: { input: "0.0000025", output: "0.000015" } },
    ]);
  });

  it("names the provider and matches it when searching", () => {
    expect(modelProvider("anthropic/claude-sonnet-4.5")).toBe("anthropic");
    expect(modelMatches({ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" }, "anthro")).toBe(true);
    expect(modelMatches({ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" }, "sonnet")).toBe(true);
    expect(modelMatches({ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" }, "gpt")).toBe(false);
  });

  it("groups the catalog by provider, then by name", () => {
    expect(gatewayLanguageModels([
      { id: "openai/gpt-5.4", name: "GPT-5.4" },
      { id: "anthropic/claude-opus", name: "Opus" },
      { id: "anthropic/claude-haiku", name: "Haiku" },
    ]).map((model) => model.id)).toEqual(["anthropic/claude-haiku", "anthropic/claude-opus", "openai/gpt-5.4"]);
  });

  it("renders model selection as a shared Settings control", () => {
    const html = renderToStaticMarkup(createElement(AiModelSettingsView, {
      value: "openai/gpt-5.4",
      models: [{ id: "openai/gpt-5.4", name: "GPT-5.4", pricing: { input: "0.0000025", output: "0.000015" } }],
    }));
    const text = html.replace(/<[^>]*>/g, "");
    expect(html).toContain("AI model");
    expect(html).toMatch(/data-slot="input-group-control"[^>]*value="GPT-5\.4"/);
    expect(text).not.toContain("openai/gpt-5.4");
    expect(text).toContain("Input $2.50 · Output $15.00 / 1M tokens");
    expect(text).toContain("openai");
    expect(html).toContain('href="https://vercel.com/ai-gateway/models"');
    expect(html).toContain("<title>OpenAI</title>");
    expect(html).toContain('placeholder="Search models…"');
    expect(readFileSync("components/mgr/views/ai-model-settings.tsx", "utf8")).not.toMatch(/<select\b/);
    expect(html).toContain("Save AI model");
  });

  it("offers the browser's full timezone index in a searchable control", () => {
    const html = renderToStaticMarkup(createElement(BrewerySettingsFormView, {
      initial: { name: "Demo", timezone: "America/New_York", ttb: "", pa: "", phone: "", hours: "24" },
    }));
    expect(Intl.supportedValuesOf("timeZone").length).toBeGreaterThan(400);
    expect(html).toContain('placeholder="Search timezones…"');
    expect(html).toMatch(/data-slot="input-group-control"[^>]*value="America \/ New York"/);
    expect(html).not.toContain("<datalist");
  });

  it("confirms successful Settings changes with top-right toasts", () => {
    expect(readFileSync("app/(app)/layout.tsx", "utf8")).toContain("<Toaster />");
    expect(readFileSync("components/ui/sonner.tsx", "utf8")).toContain('position="top-right"');
    for (const file of ["settings-form.tsx", "ai-model-settings-form.tsx", "portal-fulfillment-form.tsx"]) {
      expect(readFileSync(`app/(app)/settings/${file}`, "utf8"), file).toContain("toast.success");
    }
  });

  it("maps Gateway provider aliases to their product icons", () => {
    for (const [modelId, title] of [
      ["alibaba/qwen3-max", "Qwen"], ["amazon/nova-pro", "Nova"], ["anthropic/claude-sonnet-4.5", "Claude"],
      ["arcee-ai/trinity-large-thinking", "Arcee"], ["cohere/command-a", "CommandA"], ["google/gemini-3-flash", "Gemini"],
      ["google/gemma-4-31b-it", "Gemma"], ["inception/mercury-2", "Inception"], ["kwaipilot/kat-coder-pro-v2", "KwaiKAT"],
      ["meta/llama-4-scout", "Meta"], ["moonshotai/kimi-k2.5", "Kimi"], ["morph/morph-v3-fast", "Morph"], ["poolside/laguna-s-2.1", "Poolside"],
      ["spacexai/grok-4.20", "Grok"], ["tencent/hy4-preview", "Hunyuan"], ["zai/glm-4.7", "Z.ai"],
    ]) expect(renderToStaticMarkup(createElement(AiModelIcon, { modelId }))).toContain(`<title>${title}</title>`);
    const unknown = renderToStaticMarkup(createElement(AiModelIcon, { modelId: "sakana/fugu-max" }));
    expect(unknown).toContain('title="sakana"');
    expect(unknown).not.toContain("<title>Vercel</title>");
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
