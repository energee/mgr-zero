// tests/server-timing.test.ts — verifies stage timings are recorded and written in the Server-Timing format (#1490, #1491).
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { logServerTiming, serverTiming, timedFetch, timeStage, type Stages } from "@/lib/server-timing";
import { optionalPageQuery, runPageQuery } from "@/lib/mgr/page-query";
import { CommandError, type Ctx } from "@/lib/commands/registry";

const runCommand = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commands/registry", async (original) => ({ ...await original<object>(), runCommand }));

afterEach(() => vi.restoreAllMocks());

describe("server timing", () => {
  it("writes each stage as name;dur=ms", () => {
    expect(serverTiming({ auth: 12.3, command: 40 })).toBe("auth;dur=12.3, command;dur=40");
  });

  it("records a stage's wall time when the work resolves", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(112.345);
    const stages: Stages = {};
    await expect(timeStage(stages, "auth", async () => "ok")).resolves.toBe("ok");
    expect(stages).toEqual({ auth: 12.3 });
  });

  it("records a stage's wall time when the work throws, and rethrows", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(5);
    const stages: Stages = {};
    await expect(timeStage(stages, "command", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(stages).toEqual({ command: 5 });
  });

  it("logs render stages as one JSON line", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logServerTiming({ shell: 40.2 });
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "server_timing", timing: "shell;dur=40.2" }));
  });
});

describe("page read timing", () => {
  const ctx = {} as Ctx;
  const logged = () => vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line as string).timing);

  it("logs each page read under its command name, never its input", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    runCommand.mockResolvedValueOnce({ id: "lot-1" });
    await expect(runPageQuery("trace_lot", { lotId: "secret-id" }, ctx)).resolves.toEqual({ id: "lot-1" });
    expect(logged()).toEqual([expect.stringMatching(/^trace_lot;dur=[\d.]+$/)]);
  });

  it("logs an optional read that fails, then leaves the section out", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    runCommand.mockRejectedValueOnce(new CommandError("gone", 404));
    await expect(optionalPageQuery("get_gravity_unit", {}, ctx)).resolves.toBeUndefined();
    expect(logged()).toEqual([expect.stringMatching(/^get_gravity_unit;dur=[\d.]+$/)]);
  });
});

// docs/plans/hosted-latency.md task 1: each Supabase round trip is logged, so a
// slow page read can be split into its trips and Supabase's own share of each.
describe("round trip timing", () => {
  const logged = () => vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(line as string).timing);

  it("logs a database round trip with Supabase's reported time behind its gateway", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = new Response("[]", { headers: { "x-envoy-upstream-service-time": "7" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
    await expect(timedFetch("https://project.supabase.co/rest/v1/vessels?id=eq.secret-id")).resolves.toBe(response);
    expect(logged()).toEqual([expect.stringMatching(/^db;dur=[\d.]+, db_upstream;dur=7$/)]);
  });

  it("logs a round trip that is not a database read as supabase, without a missing header", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}"));
    await timedFetch(new Request("https://project.supabase.co/auth/v1/user"));
    expect(logged()).toEqual([expect.stringMatching(/^supabase;dur=[\d.]+$/)]);
  });

  it("logs a round trip that fails, and rethrows", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(timedFetch("https://project.supabase.co/rest/v1/vessels")).rejects.toThrow("offline");
    expect(logged()).toEqual([expect.stringMatching(/^db;dur=[\d.]+$/)]);
  });

  it("the cookie-bound server client sends its requests through it", () => {
    expect(readFileSync("lib/supabase/server.ts", "utf8")).toContain("fetch: timedFetch");
  });
});
