import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/brewery-provider", () => ({
  useBrewery: () => "brewery-a",
  useCommandContext: () => ({ actorId: "actor-a", breweryId: "brewery-a" }),
}));
import { useCommandAction } from "@/lib/commands/use-command-form";
afterEach(() => vi.unstubAllGlobals());

it("resolves failed A after newer B supersedes it, then starts an explicit new sync", async () => {
  // These browser globals also exercise #615's persistent recovery when it lands.
  const stored = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
  vi.stubGlobal("location", { pathname: "/invoices" });
  const requests: string[] = [];
  let newerBatchCompleted = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const id = JSON.parse(init.body).requestId;
    requests.push(id);
    if (requests.length === 1) throw new Error("A provider read failed");
    if (id === requests[0] && newerBatchCompleted) {
      return { status: 200, json: async () => ({ ok: true, data: { superseded: true } }) };
    }
    return { status: 200, json: async () => ({ ok: true, data: { synced: 1 } }) };
  }));
  let action: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  expect(await action!.run("sync_qbo_payments", {})).toBe(false);
  newerBatchCompleted = true;
  const outcomes: unknown[] = [];
  expect(await action!.run("sync_qbo_payments", {}, result => outcomes.push(result), { requestId: requests[0] })).toBe(true);
  expect(outcomes).toEqual([{ superseded: true }]);
  expect(await action!.run("sync_qbo_payments", {}, result => outcomes.push(result))).toBe(true);
  expect(requests[1]).toBe(requests[0]);
  expect(requests[2]).not.toBe(requests[0]);
  expect(outcomes[1]).toEqual({ synced: 1 });
  expect(stored.size).toBe(0);
});
