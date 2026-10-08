// tests/chat-models-catalog.test.ts — the Settings model catalog read. A
// Gateway outage degrades to an empty catalog (the view says the catalog is
// unavailable and keeps the saved model), and the cause is logged (#763).
import { afterEach, describe, expect, it, vi } from "vitest";

const getAvailableModels = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ gateway: { getAvailableModels } }));

import { getGatewayLanguageModels } from "@/lib/chat/models";

describe("getGatewayLanguageModels", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the language models the Gateway lists", async () => {
    getAvailableModels.mockResolvedValueOnce({ models: [{ id: "a/b", name: "B", modelType: "language" }] });
    await expect(getGatewayLanguageModels()).resolves.toEqual([{ id: "a/b", name: "B" }]);
  });

  it("logs a failed catalog read and returns an empty catalog", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getAvailableModels.mockRejectedValueOnce(new Error("gateway down"));
    await expect(getGatewayLanguageModels()).resolves.toEqual([]);
    expect(logged).toHaveBeenCalledWith("gateway model catalog unavailable:", "gateway down");
  });
});
