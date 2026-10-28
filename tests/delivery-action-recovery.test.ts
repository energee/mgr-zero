// Delivery/refusal and deferral share one unresolved-stop boundary, not two command locks.
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
const { action, effects } = vi.hoisted(() => ({ effects: [] as (() => (() => void) | void)[], action: { busy: false, error: null, failure: null as null | { kind: string }, run: vi.fn() } }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (effect: () => (() => void) | void) => effects.push(effect) }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => action }));
vi.mock("@/lib/brewery-provider", () => ({ useCommandContext: () => ({ actorId: "driver", breweryId: "brewery" }) }));
import { beginRecovery, discardRecovery, RECOVERY_CHANGED } from "@/lib/commands/recovery";
import { DeliveredForm } from "@/app/(app)/work/deliveries/[id]/delivered-form";

it.each(["confirm_delivery", "leave_delivery_for_later"])("freezes both verbs and fields after an uncertain %s result", () => {
  action.failure = { kind: "unknown" };
  const html = renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, signers: [], lines: [{ key: "line", title: "Beer", qty: "2" }] }));
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).toContain("Retry saved request");
  expect(html).toContain("Not delivered");
  action.failure = null;
});

afterEach(() => { action.failure = null; effects.length = 0; action.run.mockReset(); router.refresh.mockReset(); vi.unstubAllGlobals(); });
it.each(["confirm_delivery", "leave_delivery_for_later"])("freezes a remounted stop with saved %s recovery", (name) => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  beginRecovery(storage, { actorId: "driver", breweryId: "brewery" }, "/work/deliveries/stop", name, { deliveryId: "stop" }, { target: "stop" });
  vi.stubGlobal("sessionStorage", storage);
  const html = renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, signers: [], lines: [] }));
  expect(html).toMatch(/<fieldset[^>]*disabled/);
  expect(html).toContain("Retry saved request");
});
it("allows edits after a definitive refusal when no request remains", () => {
  action.failure = { kind: "definitive" };
  const html = renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, signers: [], lines: [] }));
  expect(html).not.toMatch(/<fieldset[^>]*disabled/);
});

it.each(["confirm_delivery", "leave_delivery_for_later"])("refreshes only after the scoped unresolved %s attempt is discarded", (name) => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  const context = { actorId: "driver", breweryId: "brewery" };
  const saved = beginRecovery(storage, context, "/work/deliveries/stop", name, { deliveryId: "stop" }, { target: "stop" });
  const other = beginRecovery(storage, context, "/work/deliveries/other", "leave_delivery_for_later", { deliveryId: "other" }, { target: "other" });
  const events = new EventTarget();
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", events);
  action.failure = { kind: "unknown" };
  renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, signers: [], lines: [] }));
  const cleanup = effects[0]();
  events.dispatchEvent(new Event(RECOVERY_CHANGED));
  expect(router.refresh).not.toHaveBeenCalled();
  discardRecovery(storage, context, other.attempt.requestId);
  expect(router.refresh).not.toHaveBeenCalled();
  discardRecovery(storage, context, saved.attempt.requestId);
  expect(router.refresh).toHaveBeenCalledTimes(1);
  cleanup?.();
});

it("does not block a stop when another stop's request is saved under its own target", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  beginRecovery(storage, { actorId: "driver", breweryId: "brewery" }, "/work/deliveries/other", "confirm_delivery", { deliveryId: "other" }, { target: "other" });
  vi.stubGlobal("sessionStorage", storage);
  const html = renderToStaticMarkup(createElement(DeliveredForm, { routeId: "route", deliveryId: "stop", transfer: false, signers: [], lines: [] }));
  expect(html).not.toMatch(/<fieldset[^>]*disabled/);
});
