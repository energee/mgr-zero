// tests/chat-models-catalog.test.ts — the Settings model catalog read. A
// Gateway outage degrades to an empty catalog (the view says the catalog is
// unavailable and keeps the saved model), and the cause is logged (#763).
// A good catalog is cached across requests; an empty fallback is not (#1491).
import { afterEach, describe, expect, it, vi } from "vitest";

const getAvailableModels = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ gateway: { getAvailableModels } }));
// Stands in for Next's data cache, which keeps a resolved result and never a thrown one.
const cacheOptions = vi.hoisted(() => [] as unknown[]);
vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>, _keys: string[], options: unknown) => {
    cacheOptions.push(options);
    let kept: Promise<unknown> | undefined;
    return () => kept ?? read().then(value => { kept = Promise.resolve(value); return value; });
  },
}));

import { getGatewayLanguageModels } from "@/lib/chat/models";

describe("getGatewayLanguageModels", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a failed read as an empty catalog, then keeps the next good catalog for an hour", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getAvailableModels.mockRejectedValueOnce(new Error("gateway down"));
    await expect(getGatewayLanguageModels()).resolves.toEqual([]);
    expect(logged).toHaveBeenCalledWith("gateway model catalog unavailable:", "gateway down");
    getAvailableModels.mockResolvedValueOnce({ models: [{ id: "a/b", name: "B", modelType: "language" }] });
    await expect(getGatewayLanguageModels()).resolves.toEqual([{ id: "a/b", name: "B" }]);
    // The good catalog is kept: the next read does not reach the Gateway.
    getAvailableModels.mockClear();
    await expect(getGatewayLanguageModels()).resolves.toEqual([{ id: "a/b", name: "B" }]);
    expect(getAvailableModels).not.toHaveBeenCalled();
    expect(cacheOptions).toEqual([{ revalidate: 3600 }]);
  });
});
