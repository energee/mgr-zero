// tests/suggest-material-category-query.test.ts — the suggest_material_category query:
// who may run it, what input it takes, that it calls no model without the brewery's key (the
// key read returns null while the brewery's switch is off or no key is saved), and that it calls
// TypeSafe with that brewery's key (docs/plans/jev-suggestions.md). The key read and the model
// call are mocked; nothing leaves the process. tests/brewery-typesafe-key.test.ts proves the key read.
import { environmentManager, focusManager, isServer, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/lib/commands/all";
import { commandQueryOptions, createQueryClient } from "@/lib/commands/query-cache";
import { getCommandDefinition, listTools, runCommand, type Ctx } from "@/lib/commands/registry";
import { resolveDecisionModel, SUGGESTION_MODEL } from "@/lib/mgr/material-category-suggestion";
import { suggestMaterialCategory } from "@/lib/suggest-material-category";
import { readBreweryTypeSafeKey, recordMaterialKindSuggestion } from "@/lib/supabase/integration-tokens";

vi.mock("@/lib/suggest-material-category", () => ({ suggestMaterialCategory: vi.fn() }));
vi.mock("@/lib/supabase/integration-tokens", () => ({ readBreweryTypeSafeKey: vi.fn(), recordMaterialKindSuggestion: vi.fn() }));
vi.mock("@/lib/mgr/material-category-suggestion", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/mgr/material-category-suggestion")>();
  return { ...actual, resolveDecisionModel: vi.fn(actual.resolveDecisionModel) };
});

// The handler never touches the database itself; the key read is mocked.
const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "u", breweryId: "b", roles: ["brewer"] };

function savedKey(key: string | null) {
  vi.mocked(readBreweryTypeSafeKey).mockResolvedValue(key);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  environmentManager.setIsServer(() => isServer);
  focusManager.setFocused(undefined);
  vi.mocked(suggestMaterialCategory).mockReset();
  vi.mocked(readBreweryTypeSafeKey).mockReset();
  vi.mocked(recordMaterialKindSuggestion).mockReset();
  vi.mocked(resolveDecisionModel).mockClear();
});

describe("suggest_material_category", () => {
  it("is a purchasing query hidden from agents", () => {
    const definition = getCommandDefinition("suggest_material_category");
    expect(definition?.kind).toBe("query");
    expect(definition?.roles).toEqual(["admin", "warehouse", "brewer"]);
    // It sends brewery text to an outside model (tests/agent-hidden.test.ts).
    expect(listTools().find(tool => tool.name === "suggest_material_category")?.agentHidden).toBe(true);
  });

  it("refuses a blank name", async () => {
    savedKey("brewery-key");
    await expect(runCommand("suggest_material_category", { name: "  " }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
    expect(suggestMaterialCategory).not.toHaveBeenCalled();
  });

  it("returns nulls and calls no model when the brewery has no usable key", async () => {
    savedKey(null);
    await expect(runCommand("suggest_material_category", { name: "Citra T-90" }, ctx)).resolves.toEqual({ category: null, probability: null });
    expect(readBreweryTypeSafeKey).toHaveBeenCalledWith(ctx);
    expect(resolveDecisionModel).not.toHaveBeenCalled();
    expect(suggestMaterialCategory).not.toHaveBeenCalled();
    expect(recordMaterialKindSuggestion).not.toHaveBeenCalled();
  });

  it("ignores TYPESAFE_API_KEY and MGR_SUGGESTIONS in the environment", async () => {
    savedKey(null);
    vi.stubEnv("TYPESAFE_API_KEY", "from-env");
    vi.stubEnv("MGR_SUGGESTIONS", "on");
    await expect(runCommand("suggest_material_category", { name: "Citra T-90" }, ctx)).resolves.toEqual({ category: null, probability: null });
    expect(suggestMaterialCategory).not.toHaveBeenCalled();
  });

  it("asks TypeSafe with this brewery's key and returns the confident kind for the trimmed name", async () => {
    savedKey("brewery-key");
    vi.mocked(suggestMaterialCategory).mockResolvedValueOnce({ choice: "hop", probability: 0.95 });
    await expect(runCommand("suggest_material_category", { name: " Citra T-90 " }, ctx)).resolves.toEqual({ category: "hop", probability: 0.95 });
    expect(resolveDecisionModel).toHaveBeenCalledWith(SUGGESTION_MODEL, "brewery-key");
    expect(suggestMaterialCategory).toHaveBeenCalledWith("Citra T-90", vi.mocked(resolveDecisionModel).mock.results[0].value);
    expect(recordMaterialKindSuggestion).toHaveBeenCalledWith(ctx, "Citra T-90", { choice: "hop", probability: 0.95 });
  });

  it("returns nulls when no kind reached the threshold", async () => {
    savedKey("brewery-key");
    vi.mocked(suggestMaterialCategory).mockResolvedValueOnce(null);
    await expect(runCommand("suggest_material_category", { name: "Mystery item" }, ctx)).resolves.toEqual({ category: null, probability: null });
    // Counted too, so Settings can say how many names got no suggestion.
    expect(recordMaterialKindSuggestion).toHaveBeenCalledWith(ctx, "Mystery item", null);
  });

  it("logs a failed call and answers 502 upstream_unavailable", async () => {
    savedKey("brewery-key");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // A provider error carries the request body; only its message may reach the log.
    vi.mocked(suggestMaterialCategory).mockRejectedValueOnce(Object.assign(new Error("timeout"), { requestBodyValues: { materialName: "Citra T-90" } }));
    await expect(runCommand("suggest_material_category", { name: "Citra T-90" }, ctx)).rejects.toMatchObject({ status: 502, code: "upstream_unavailable" });
    expect(log).toHaveBeenCalledWith("suggest_material_category_failed", "timeout");
    expect(recordMaterialKindSuggestion).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

// Each request is a paid model call carrying brewery text, so the client asks once per name.
describe("the cached suggestion read", () => {
  const scope = { actorId: "actor", breweryId: "brewery", roles: ["brewer"] };

  it("does not poll, refetch on focus, or retry a failure", async () => {
    vi.useFakeTimers();
    environmentManager.setIsServer(() => false);
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { message: "unavailable" } }), { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    const cache = createQueryClient();
    cache.mount();
    const observer = new QueryObserver(cache, commandQueryOptions(scope, "suggest_material_category", { name: "Citra T-90" }));
    const stop = observer.subscribe(() => undefined);
    try {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(observer.getCurrentResult().isError).toBe(true);
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { stop(); cache.unmount(); cache.clear(); }
  });
});
