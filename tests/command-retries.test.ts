// tests/command-retries.test.ts — Shared command transport retains failed submission identity and resets new intent.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/brewery-provider", () => ({ useBrewery: () => "brewery-a" }));
import { useCommandAction } from "@/lib/commands/use-command-form";
import { command } from "@/lib/commands/client";
afterEach(() => vi.unstubAllGlobals());

it("retains a failed submission ID, resets changed intent, and resets after success", async () => {
  const requests: { requestId: string }[] = [];
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
  await action!.run("set_brewery_quiet_hours", { start: "21:00" });
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  expect(requests[0].requestId).toBe(requests[1].requestId);
  expect(requests[2].requestId).not.toBe(requests[1].requestId);
  fail = false;
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  await action!.run("set_brewery_quiet_hours", { start: "22:00" });
  expect(requests[3].requestId).toBe(requests[2].requestId);
  expect(requests[4].requestId).not.toBe(requests[3].requestId);
  await command("brewery-a", "unchanged_three_argument_caller", {});
  expect(requests[5].requestId).toMatch(/^[0-9a-f-]{36}$/);
});
