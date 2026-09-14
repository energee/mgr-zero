import { afterEach, expect, it, vi } from "vitest";
import { environmentManager, focusManager, isServer, onlineManager, QueryObserver } from "@tanstack/react-query";
import { command } from "@/lib/commands/client";
import { commandQueryOptions, createQueryClient, subscribeToCommandChanges } from "@/lib/commands/query-cache";

const scope = { actorId: "actor", breweryId: "brewery", role: "admin" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  environmentManager.setIsServer(() => isServer);
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

it("deduplicates concurrent reads and reuses fresh data without another request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ ok: true, data: [{ id: "order" }] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const options = commandQueryOptions(scope, "list_orders", {});
  await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)]);
  await cache.fetchQuery(options);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
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
  await vi.waitFor(() => expect(cache.getQueryState(key)?.isInvalidated).toBe(true));
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
  await vi.waitFor(() => expect(cache.getQueryState(key)?.isInvalidated).toBe(true));
  expect(fetch).toHaveBeenCalledTimes(1);
  stop(); cache.clear();
});

it("keeps stale data visible during background refresh, then replaces it", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const cache = createQueryClient();
  const options = commandQueryOptions<string[]>(scope, "list_orders", {});
  cache.setQueryData(options.queryKey, ["old"], { updatedAt: Date.now() - 31_000 });
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => undefined);
  expect(observer.getCurrentResult()).toMatchObject({ data: ["old"], isFetching: true, isPending: false });
  finish(new Response(JSON.stringify({ ok: true, data: ["new"] })));
  await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(["new"]));
  stop(); cache.clear();
});

it("does not turn a failed cached query into an invalidation/refetch loop", async () => {
  vi.stubGlobal("window", new EventTarget());
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { message: "denied" } }), { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const stop = subscribeToCommandChanges(cache, scope);
  await expect(cache.fetchQuery(commandQueryOptions(scope, "list_orders", {}))).rejects.toThrow("denied");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(invalidate).not.toHaveBeenCalled();
  stop(); cache.clear();
});

it("creates independent caches rather than sharing data between server renders", () => {
  const first = createQueryClient();
  const second = createQueryClient();
  const key = commandQueryOptions(scope, "list_orders", {}).queryKey;
  first.setQueryData(key, ["private"]);
  expect(second.getQueryData(key)).toBeUndefined();
  first.clear(); second.clear();
});

it("cancels an in-flight read before write invalidation can accept its old response", async () => {
  vi.stubGlobal("window", new EventTarget());
  let signal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => {
    signal = options.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }));
  const cache = createQueryClient();
  const options = commandQueryOptions(scope, "list_orders", {});
  const stop = subscribeToCommandChanges(cache, scope);
  const read = cache.fetchQuery(options).catch(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: {}, requestId: "write" }))));
  await command("brewery", "create_order", {});
  await read;
  expect(signal.aborted).toBe(true);
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  stop(); cache.clear();
});

it("refreshes visible orders after five seconds, keeping cached rows until the response arrives", async () => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const options = commandQueryOptions<string[]>(scope, "list_orders", {});
  cache.setQueryData(options.queryKey, ["old"]);
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => undefined);
  try {
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult()).toMatchObject({ data: ["old"], isFetching: true, isPending: false });
    finish(new Response(JSON.stringify({ ok: true, data: ["changed by another user"] })));
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().data).toEqual(["changed by another user"]);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { stop(); cache.clear(); }
});

it("pauses hidden-tab polling and rechecks on return even when cached data is still fresh", async () => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  focusManager.setFocused(false);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: ["current"] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  cache.mount();
  const options = commandQueryOptions<string[]>(scope, "list_orders", {});
  cache.setQueryData(options.queryKey, ["old"]);
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => undefined);
  try {
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).not.toHaveBeenCalled();
    // Another same-tab read may have populated a fresh entry while this page was hidden.
    cache.setQueryData(options.queryKey, ["recent"]);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult().data).toEqual(["current"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { stop(); cache.unmount(); cache.clear(); }
});

it("keeps last-known rows while offline and reconciles on reconnect", async () => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: ["current"] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  cache.mount();
  const options = commandQueryOptions<string[]>(scope, "list_orders", {});
  cache.setQueryData(options.queryKey, ["old"]);
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => undefined);
  try {
    onlineManager.setOnline(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(observer.getCurrentResult()).toMatchObject({ data: ["old"], isPaused: true });
    onlineManager.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(observer.getCurrentResult()).toMatchObject({ data: ["current"], isPaused: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { stop(); cache.unmount(); cache.clear(); }
});

it("refreshes form lookups less often without keeping them indefinitely stale on an open page", async () => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: ["new customer"] })));
  vi.stubGlobal("fetch", fetch);
  const cache = createQueryClient();
  const options = commandQueryOptions<string[]>(scope, "list_customers", { includeShipTos: true });
  cache.setQueryData(options.queryKey, ["old customer"]);
  const observer = new QueryObserver(cache, options);
  const stop = observer.subscribe(() => undefined);
  try {
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(observer.getCurrentResult().data).toEqual(["new customer"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { stop(); cache.clear(); }
});
