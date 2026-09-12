// tests/command-retries.test.ts — Shared command transport retains failed submission identity and resets new intent.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let renderedContext = { actorId: "actor-a", breweryId: "brewery-a" };
vi.mock("@/app/(app)/brewery-provider", () => ({
  useBrewery: () => renderedContext.breweryId,
  useCommandContext: () => renderedContext,
}));
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";
import { command } from "@/lib/commands/client";
afterEach(() => vi.unstubAllGlobals());

it("retains a failed submission ID and rendered context, resets changed intent, and resets after success", async () => {
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
  expect(requests[2].requestId).not.toBe(requests[1].requestId);
  fail = false;
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  expect(requests[3].requestId).toBe(requests[2].requestId);
  expect(requests[4].requestId).not.toBe(requests[3].requestId);
  await command("brewery-a", "unchanged_three_argument_caller", {});
  expect(requests[5].requestId).toMatch(/^[0-9a-f-]{36}$/);
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
  await form!.submit({ preventDefault() {}, stopPropagation() {} } as React.FormEvent);
  expect(received).toEqual([]);
  fail = false;
  await form!.submit({ preventDefault() {}, stopPropagation() {} } as React.FormEvent);
  expect(ids[0]).toBe(ids[1]);
  expect(received).toEqual([receipt]);
});
