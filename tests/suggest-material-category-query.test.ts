// tests/suggest-material-category-query.test.ts — the suggest_material_category query:
// who may run it, what input it takes, and that it calls no model while suggestions are off
// (docs/plans/jev-suggestions.md, Task 5). The model call itself is mocked; nothing leaves the process.
import { environmentManager, focusManager, isServer, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/lib/commands/all";
import { commandQueryOptions, createQueryClient } from "@/lib/commands/query-cache";
import { getCommandDefinition, listTools, runCommand, type Ctx } from "@/lib/commands/registry";
import { suggestMaterialCategory } from "@/lib/suggest-material-category";

vi.mock("@/lib/suggest-material-category", () => ({ suggestMaterialCategory: vi.fn() }));

// The handler never touches the database.
const ctx: Ctx = { db: null as unknown as Ctx["db"], userId: "u", breweryId: "b", roles: ["brewer"] };
const ON = { MGR_SUGGESTIONS: "on", TYPESAFE_API_KEY: "k" };

function stubEnv(env: Record<string, string>) {
  for (const name of ["MGR_SUGGESTIONS", "TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "VERCEL"]) vi.stubEnv(name, env[name] ?? "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  environmentManager.setIsServer(() => isServer);
  focusManager.setFocused(undefined);
  vi.mocked(suggestMaterialCategory).mockReset();
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
    stubEnv(ON);
    await expect(runCommand("suggest_material_category", { name: "  " }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
    expect(suggestMaterialCategory).not.toHaveBeenCalled();
  });

  it("returns nulls and calls no model while suggestions are off", async () => {
    stubEnv({});
    await expect(runCommand("suggest_material_category", { name: "Citra T-90" }, ctx)).resolves.toEqual({ category: null, probability: null });
    expect(suggestMaterialCategory).not.toHaveBeenCalled();
  });

  it("returns the model's confident kind for the trimmed name", async () => {
    stubEnv(ON);
    vi.mocked(suggestMaterialCategory).mockResolvedValueOnce({ choice: "hop", probability: 0.95 });
    await expect(runCommand("suggest_material_category", { name: " Citra T-90 " }, ctx)).resolves.toEqual({ category: "hop", probability: 0.95 });
    expect(suggestMaterialCategory).toHaveBeenCalledWith("Citra T-90");
  });

  it("returns nulls when no kind reached the threshold", async () => {
    stubEnv(ON);
    vi.mocked(suggestMaterialCategory).mockResolvedValueOnce(null);
    await expect(runCommand("suggest_material_category", { name: "Mystery item" }, ctx)).resolves.toEqual({ category: null, probability: null });
  });

  it("logs a failed call and answers 502 upstream_unavailable", async () => {
    stubEnv(ON);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(suggestMaterialCategory).mockRejectedValueOnce(new Error("timeout"));
    await expect(runCommand("suggest_material_category", { name: "Citra T-90" }, ctx)).rejects.toMatchObject({ status: 502, code: "upstream_unavailable" });
    expect(log).toHaveBeenCalledWith("suggest_material_category_failed", expect.any(Error));
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
