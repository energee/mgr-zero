import { afterEach, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";
import { command } from "@/lib/commands/client";
import { commandQueryOptions, createQueryClient, subscribeToCommandChanges } from "@/lib/commands/query-cache";

const scope = { actorId: "actor", breweryId: "brewery", role: "admin" };
afterEach(() => vi.unstubAllGlobals());

it("deduplicates concurrent reads and reuses fresh data without another request", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: [{ id: "order" }] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const options = commandQueryOptions(scope, "list_orders", {});
  await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)]);
  await cache.fetchQuery(options);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).expectedContext).toEqual({ actorId: "actor", breweryId: "brewery" });
  cache.clear();
});

it("separates users, breweries, roles, customer scopes and query inputs", () => {
  const keys = [scope, { ...scope, actorId: "other" }, { ...scope, breweryId: "other" }, { ...scope, role: "sales" }, { ...scope, customerId: "buyer" }]
    .map(context => JSON.stringify(commandQueryOptions(context, "list_orders", {}).queryKey));
  keys.push(JSON.stringify(commandQueryOptions(scope, "list_orders", { status: "draft" }).queryKey));
  expect(new Set(keys).size).toBe(6);
});

it("does not fetch a lazy query until enabled", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: [] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const options = commandQueryOptions(scope, "list_customers", { includeShipTos: true });
  const observer = new QueryObserver(cache, { ...options, enabled: false });
  const stop = observer.subscribe(() => undefined);
  expect(fetch).not.toHaveBeenCalled();
  observer.setOptions({ ...options, enabled: true });
  await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  stop(); cache.clear();
});

it("invalidates cached reads after a successful write but not a successful query", async () => {
  vi.stubGlobal("window", new EventTarget());
  const cache = createQueryClient();
  const key = commandQueryOptions(scope, "list_orders", {}).queryKey;
  cache.setQueryData(key, []);
  const stop = subscribeToCommandChanges(cache, scope);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: [] }))));
  await command("brewery", "list_orders", {});
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: {}, requestId: "write" }))));
  await command("brewery", "create_order", {});
  expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
  stop(); cache.clear();
});

it("does not invalidate another brewery and unregisters on unmount", async () => {
  vi.stubGlobal("window", new EventTarget());
  const cache = createQueryClient();
  const key = commandQueryOptions(scope, "list_orders", {}).queryKey;
  cache.setQueryData(key, []);
  const stop = subscribeToCommandChanges(cache, scope);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: {}, requestId: "write" }))));
  await command("another", "create_order", {});
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  stop();
  await command("brewery", "create_order", {});
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  cache.clear();
});

it("invalidates on an uncertain write failure without retrying the write", async () => {
  vi.stubGlobal("window", new EventTarget());
  const cache = createQueryClient();
  const key = commandQueryOptions(scope, "list_orders", {}).queryKey;
  cache.setQueryData(key, []);
  const stop = subscribeToCommandChanges(cache, scope);
  const fetch = vi.fn(async () => { throw new Error("connection lost"); });
  vi.stubGlobal("fetch", fetch);
  await expect(command("brewery", "create_order", {})).rejects.toThrow("connection lost");
  expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  stop(); cache.clear();
});
