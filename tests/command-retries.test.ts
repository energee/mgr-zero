// tests/command-retries.test.ts — Shared command transport retains failed submission identity and resets new intent.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let renderedContext = { actorId: "actor-a", breweryId: "brewery-a" };
vi.mock("@/lib/brewery-provider", () => ({
  useBrewery: () => renderedContext.breweryId,
  useCommandContext: () => renderedContext,
}));
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import { CommandRecovery } from "@/components/mgr/command-recovery";
import { beginRecovery, inFlightRequests, readRecoveries } from "@/lib/commands/recovery";
import { useExactCommand } from "@/components/mgr/views/pos-controls";
import { readFileSync } from "node:fs";
import { command } from "@/lib/commands/client";
import { submitEvent } from "./helpers";
let retrySaved: (id: string) => Promise<void>;
let discardSaved: (id: string) => void;
vi.mock("@/components/mgr/views/command-recovery", () => ({
  CommandRecoveryView: (props: { onRetry: typeof retrySaved; onDiscard: typeof discardSaved }) => { retrySaved = props.onRetry; discardSaved = props.onDiscard; return null; },
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
  const saved = beginRecovery(storage, renderedContext, "/orders", "create_order", { note: "original" }).attempt;
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

it.each([200, 403])("isolates concurrent commands on one page when the second returns %s", async (status) => {
  const requests: { name: string; requestId: string }[] = [];
  let releaseCatalog!: () => void;
  const catalogPending = new Promise<void>(resolve => { releaseCatalog = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (request.name === "sync_square_catalog") await catalogPending;
    if (request.name === "sync_square_sales" && status === 403) return { status, json: async () => ({ ok: false, error: { message: "Sales access denied" } }) };
    return { status: 200, json: async () => ({ ok: true, data: {} }) };
  }));
  let catalog!: ReturnType<typeof useCommandAction>, sales!: ReturnType<typeof useCommandAction>;
  function Harness() { catalog = useCommandAction(); sales = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  const inFlight = catalog.run("sync_square_catalog", {});
  try {
    expect(await sales.run("sync_square_sales", {})).toBe(status === 200);
    expect(requests.map(request => request.name)).toEqual(["sync_square_catalog", "sync_square_sales"]);
    expect(new Set(requests.map(request => request.requestId)).size).toBe(2);
    // The independent result must not remove the catalog's still-pending recovery.
    expect(readRecoveries(sessionStorage, renderedContext).map(attempt => attempt.name)).toEqual(["sync_square_catalog"]);
    renderToStaticMarkup(createElement(Harness)); // Reload while catalog is still in flight.
    expect(await catalog.run("sync_square_catalog", { changed: true })).toBe(false);
    expect(requests).toHaveLength(2);
  } finally {
    releaseCatalog();
    await inFlight;
  }
  expect(readRecoveries(sessionStorage, renderedContext)).toEqual([]);
});

it("keeps an unknown outcome on one targeted row from blocking the same command on another row (#615)", async () => {
  const requests: { requestId: string; input: { invoiceId: string } }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    if (request.input.invoiceId === "invoice-a") throw new Error("response lost");
    return { status: 422, json: async () => ({ ok: false, error: { message: "customer not mapped" } }) };
  }));
  let action!: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  expect(await action.run("push_invoice_to_qbo", { invoiceId: "invoice-a" }, undefined, { target: "invoice-a" })).toBe(false);
  expect(await action.run("push_invoice_to_qbo", { invoiceId: "invoice-b" }, undefined, { target: "invoice-b" })).toBe(false);
  expect(requests.map(request => request.input.invoiceId)).toEqual(["invoice-a", "invoice-b"]);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
  // B's definitive rejection clears B only; A's unknown outcome stays saved.
  expect(readRecoveries(sessionStorage, renderedContext).map(attempt => attempt.input)).toEqual([{ invoiceId: "invoice-a" }]);
  expect(await action.run("push_invoice_to_qbo", { invoiceId: "invoice-a", memo: "edited" }, undefined, { target: "invoice-a" })).toBe(false);
  expect(requests).toHaveLength(2);
});

it("Discard ends a request kept after a rejected retry, so a corrected submit proceeds (#615)", async () => {
  const requests: { requestId: string; input: unknown }[] = [];
  let response: "dropped" | "denied" = "dropped";
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (response === "dropped") throw new Error("committed, response lost");
    return { status: 403, json: async () => ({ ok: false, error: { message: "membership changed" } }) };
  }));
  let action!: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  await action.run("record_movement", { binId: "bin", qty: 2 });
  response = "denied";
  await action.run("record_movement", { binId: "bin", qty: 2 });
  // Conservative: a rejected retry cannot prove the first send did nothing.
  const [kept] = readRecoveries(sessionStorage, renderedContext);
  expect(kept.requestId).toBe(requests[0].requestId);
  renderToStaticMarkup(createElement(CommandRecovery));
  discardSaved(kept.requestId);
  expect(readRecoveries(sessionStorage, renderedContext)).toEqual([]);
  await action.run("record_movement", { binId: "bin", qty: 3 });
  expect(requests).toHaveLength(3);
  expect(requests[2].requestId).not.toBe(kept.requestId);
});

it("reports the request id actually sent, and a deliberate new attempt replaces the saved one (#615)", async () => {
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => { sent.push(JSON.parse(init.body).requestId); throw new Error("response lost"); }));
  let exact!: ReturnType<typeof useExactCommand>;
  function Harness() { exact = useExactCommand(); return null; }
  renderToStaticMarkup(createElement(Harness));
  const first = await exact.run("sync_square_catalog", {});
  renderToStaticMarkup(createElement(Harness)); // Reload: the hook no longer holds the attempt.
  const resumed = await exact.run("sync_square_catalog", {});
  expect(sent[1]).toBe(sent[0]);
  expect([first.requestId, resumed.requestId]).toEqual([sent[0], sent[0]]);
  const fresh = await exact.run("sync_square_catalog", {}, true);
  expect(sent[2]).not.toBe(sent[0]);
  expect(fresh.requestId).toBe(sent[2]);
  expect(readRecoveries(sessionStorage, renderedContext).map(attempt => attempt.requestId)).toEqual([sent[2]]);
  // Item publication is scoped to its item.
  await exact.run("publish_pos_item", { posLocationId: "l", brandId: "a" }, false, "l:a");
  await exact.run("publish_pos_item", { posLocationId: "l", brandId: "b" }, false, "l:b");
  expect(sent).toHaveLength(5);
  expect(sent[4]).not.toBe(sent[3]);
});

it("keeps a request in flight in this tab out of reach of Discard until its outcome arrives (#615)", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => { await pending; throw new Error("response lost"); }));
  let action!: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  const inFlight = action.run("record_movement", { qty: 1 });
  const [saved] = readRecoveries(sessionStorage, renderedContext);
  expect(inFlightRequests.has(saved.requestId)).toBe(true);
  renderToStaticMarkup(createElement(CommandRecovery));
  discardSaved(saved.requestId);
  expect(readRecoveries(sessionStorage, renderedContext)).toEqual([saved]);
  release();
  await inFlight;
  expect(inFlightRequests.has(saved.requestId)).toBe(false);
  discardSaved(saved.requestId);
  expect(readRecoveries(sessionStorage, renderedContext)).toEqual([]);
});

it("does not save a non-durable call: a read or a one-time link proof (#615)", async () => {
  const saved: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async () => { saved.push(readRecoveries(sessionStorage, renderedContext)); throw new Error("response lost"); }));
  let action!: ReturnType<typeof useCommandAction>;
  function Harness() { action = useCommandAction(); return null; }
  renderToStaticMarkup(createElement(Harness));
  expect(await action.run("consume_chat_link_proof", { proof: "one-time" }, undefined, { durable: false })).toBe(false);
  expect(saved).toEqual([[]]);
  expect(readRecoveries(sessionStorage, renderedContext)).toEqual([]);
  const chat = readFileSync("app/(app)/settings/chat/chat-settings-client.tsx", "utf8");
  expect(chat).toMatch(/"list_chat_channels"[^\n]*durable: false/);
  expect(chat).toMatch(/"consume_chat_link_proof"[^\n]*durable: false/);
  expect(chat.match(/durable: false/g)).toHaveLength(2);
});

it("scopes existing-row edit sheets and row actions to their row; creates stay untargeted (#615)", () => {
  const src = (path: string) => readFileSync(`app/(app)/${path}`, "utf8");
  for (const [path, target] of [
    ["customers/ship-to-form.tsx", "target: shipTo?.id"],
    ["settings/team/member-form.tsx", "target: member.userId"],
    ["settings/channels/channel-form.tsx", "target: channel?.id"],
    ["compliance/licenses/license-form.tsx", "target: license?.id"],
    ["vendors/contract-form.tsx", "target: contract?.id"],
    ["replenishment/quantity-form.tsx", "target: allocationId"],
    ["catalog/pour-form.tsx", "target: pour?.id"],
    ["locations/bin-form.tsx", "target: bin?.id"],
    ["catalog/brands/[id]/brand-page.tsx", "{ target: previousName }"],
    ["settings/chat/chat-settings-client.tsx", "{ target: preferences.link.id }"],
  ]) expect(src(path), path).toContain(target);
  const chat = src("settings/chat/chat-settings-client.tsx");
  expect(chat).toMatch(/"set_notification_preference"[^\n]*\{ target: reason \}/);
  expect(chat).toMatch(/"set_notification_destination", \{ reason[^\n]*\{ target: reason \}/);
  const pos = readFileSync("components/mgr/views/pos-controls.tsx", "utf8");
  expect(pos).toContain("`${posLocationId}:${brandId}`");
});
