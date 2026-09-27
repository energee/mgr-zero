// tests/command-retries.test.ts — Shared command transport retains failed submission identity and resets new intent.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let renderedContext = { actorId: "actor-a", breweryId: "brewery-a" };
vi.mock("@/app/(app)/brewery-provider", () => ({
  useBrewery: () => renderedContext.breweryId,
  useCommandContext: () => renderedContext,
}));
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import { CommandRecovery } from "@/components/mgr/command-recovery";
import { beginRecovery } from "@/lib/commands/recovery";
import { command } from "@/lib/commands/client";
import { submitEvent } from "./helpers";
let retrySaved: (id: string) => Promise<void>;
vi.mock("@/components/mgr/views/command-recovery", () => ({
  CommandRecoveryView: (props: { onRetry: typeof retrySaved }) => { retrySaved = props.onRetry; return null; },
}));
beforeEach(() => {
  renderedContext = { actorId: "actor-a", breweryId: "brewery-a" };
  const values = new Map<string, string>();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal("location", { pathname: "/test-form" });
});
afterEach(() => vi.unstubAllGlobals());

it("retains a failed submission ID and rendered context, blocks changed intent, and resets after success", async () => {
  const requests: { requestId: string; expectedContext: unknown }[] = [];
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (fail) throw new Error("network failed after commit");
    return { status: 200, json: async () => ({ ok: true, data: { ok: true } }) };
  }));
  let action: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  await action!.run("set_brewery_quiet_hours", { start: "21:00" });
  renderedContext = { actorId: "actor-b", breweryId: "brewery-b" };
  await action!.run("set_brewery_quiet_hours", { start: "21:00" });
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[0].expectedContext).toEqual({ actorId: "actor-a", breweryId: "brewery-a" });
  expect(requests[1].expectedContext).toEqual(requests[0].expectedContext);
  expect(requests).toHaveLength(2); // Edited intent must not issue another write while the outcome is unknown.
  fail = false;
  await action!.run("set_brewery_quiet_hours", { start: "21:00" });
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  expect(requests[2].requestId).toBe(requests[1].requestId);
  expect(requests[3].requestId).not.toBe(requests[2].requestId);
  await command("brewery-a", "unchanged_three_argument_caller", {});
  expect(requests[4].requestId).toMatch(/^[0-9a-f-]{36}$/);
  renderedContext = { actorId: "actor-a", breweryId: "brewery-a" };
});

it("only hands a committed result to the form receipt after success, including exact retry", async () => {
  const receipt = { id: "movement-id", bbl: 0.129, bin_id: "bin-id", dest_state: "PA" };
  let fail = true;
  const ids: string[] = [], received: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    ids.push(JSON.parse(init.body).requestId);
    if (fail) throw new Error("response lost");
    return { status: 200, json: async () => ({ ok: true, data: receipt }) };
  }));
  let form: ReturnType<typeof useCommandForm>;
  function Harness() { form = useCommandForm("record_movement", { build: () => ({ qty: 2 }), reset: vi.fn(), onSuccess: data => received.push(data) }); return null; }
  renderToStaticMarkup(createElement(Harness));
  await form!.submit(submitEvent().event);
  expect(received).toEqual([]);
  fail = false;
  await form!.submit(submitEvent().event);
  expect(ids[0]).toBe(ids[1]);
  expect(received).toEqual([receipt]);
});

it("keeps a sheet's submit from reaching an enclosing page form", async () => {
  // A sheet is a form in a dialog portal; React bubbles its submit through the tree.
  vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: {} }) })));
  let form: ReturnType<typeof useCommandForm>;
  function Harness() { form = useCommandForm("record_movement", { build: () => ({}), reset: vi.fn() }); return null; }
  renderToStaticMarkup(createElement(Harness));
  const { event, seen } = submitEvent();
  await form!.submit(event);
  expect(seen).toEqual({ prevented: true, stopped: true });
});

it("runs a sheet's secondary action (Remove, Delete, Clear) through the form's one error slot (#447)", async () => {
  const names: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    names.push(JSON.parse(init.body).name);
    return { status: 400, json: async () => ({ ok: false, error: { message: "in use" } }) };
  }));
  let form: ReturnType<typeof useCommandForm>;
  function Harness() { form = useCommandForm("update_bin", { build: () => ({}), reset: vi.fn() }); return null; }
  renderToStaticMarkup(createElement(Harness));
  expect(await form!.run("delete_bin", { binId: "b" })).toBe(false);
  expect(names).toEqual(["delete_bin"]);
});

it("clears every sheet error on close: secondary actions share the form's slot, bespoke state resets (#447)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = (p: string) => readFileSync(new URL(`../app/(app)/${p}`, import.meta.url), "utf8");
  for (const p of ["locations/bin-form.tsx", "pricing/group-form.tsx", "pricing/price-cell-form.tsx", "settings/team/member-form.tsx"]) {
    expect(src(p), p).not.toContain("useCommandAction(");
    expect(src(p), p).toContain("form.run(");
  }
  expect(src("settings/team/invite-form.tsx")).toContain("if (!next) action.setError(null)");
  expect(src("inventory/movement-form.tsx")).toMatch(/reset: \(\) => \{ setStockError\(null\);/);
});

it("persists a dropped response before fetch, survives reload and auth rejection, and replays the frozen input", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal("location", { pathname: "/inventory" });
  const requests: { requestId: string; input: unknown }[] = [];
  let response: "dropped" | "denied" | "ok" = "dropped";
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    expect(values.size).toBe(1);
    requests.push(JSON.parse(init.body));
    if (response === "dropped") throw new Error("committed, response lost");
    if (response === "denied") return { status: 403, json: async () => ({ ok: false, error: { message: "membership changed" } }) };
    return { status: 200, json: async () => ({ ok: true, data: { id: "original" } }) };
  }));
  let action: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  await action!.run("record_movement", { qty: 2, note: "original" });
  renderToStaticMarkup(createElement(Harness)); // Reload: no retained hook refs.
  expect(await action!.run("record_movement", { qty: 3, note: "edited" })).toBe(false);
  expect(requests).toHaveLength(1);
  response = "denied";
  location.pathname = "/another-entry"; // Same operation from a sibling entry point.
  renderToStaticMarkup(createElement(Harness));
  await action!.run("record_movement", { qty: 2, note: "original" });
  expect(values.size).toBe(1);
  response = "ok";
  await action!.run("record_movement", { qty: 2, note: "original" });
  expect(requests.map(row => row.requestId)).toEqual(Array(3).fill(requests[0].requestId));
  expect(requests.map(row => row.input)).toEqual(Array(3).fill({ qty: 2, note: "original" }));
  expect(values.size).toBe(0);
});

it("reloads after global recovery so mounted forms cannot resubmit stale fields", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) };
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("sessionStorage", storage);
  const reload = vi.fn(() => expect(values.size).toBe(0));
  vi.stubGlobal("location", { pathname: "/orders", reload });
  const saved = beginRecovery(storage, renderedContext, "/orders", "create_order", { note: "original" });
  const fetch = vi.fn(async (_url, init) => {
    expect(JSON.parse(init.body)).toMatchObject({ requestId: saved.requestId, input: { note: "original" } });
    return { status: 200, json: async () => ({ ok: true, data: { id: "existing-order" } }) };
  });
  vi.stubGlobal("fetch", fetch);
  renderToStaticMarkup(createElement(CommandRecovery));
  await retrySaved(saved.requestId);
  expect(reload).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
});
