// tests/api-command.test.ts — verifies typed command/query envelopes over POST /api/command.
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { command } from "@/lib/commands/client";
import { type CommandExecution, type Ctx, defineCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
import { MAX_COMMAND_BODY_BYTES } from "@/lib/commands/request-limits";
import { makeBrewery, makeStaff, sql } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function signIn(email: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "test-password-1" });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

function commandReq(body: unknown, token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/command", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("POST /api/command bearer auth", () => {
  let breweryId: string;
  let adminToken: string;
  let adminId: string;
  let secondAdminToken: string;
  let warehouseToken: string;
  const executionHandler = vi.fn(async (_ctx: Ctx, _input: Record<string, never>, execution: CommandExecution) => execution);

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    const admin = await makeStaff(breweryId, "admin");
    adminId = admin.id;
    const secondAdmin = await makeStaff(breweryId, "admin");
    const warehouse = await makeStaff(breweryId, "warehouse");
    adminToken = await signIn(admin.email);
    secondAdminToken = await signIn(secondAdmin.email);
    warehouseToken = await signIn(warehouse.email);
    defineCommand({
      name: "execution_metadata_probe",
      input: z.object({}),
      roles: ["admin"],
      handler: executionHandler,
    });
  });

  it("serializes one UUID request id for a browser command action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, data: { created: true }, requestId: randomUUID(), correlationId: randomUUID() }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(command("brewery-id", "upsert_brand", { name: "Pils" }, undefined, {
        actorId: "00000000-0000-4000-8000-000000000001",
        breweryId: "brewery-id",
      })).resolves.toEqual({ created: true });
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body) as { requestId: string; expectedContext: unknown };
      expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(body.expectedContext).toEqual({ actorId: "00000000-0000-4000-8000-000000000001", breweryId: "brewery-id" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("forwards the same caller-owned request ID on invitation retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: { userId: "recipient" } }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const requestId = randomUUID();
      const input = { email: "recipient@example.com", role: "sales" };
      await command("brewery-id", "invite_staff", input, requestId);
      await command("brewery-id", "invite_staff", input, requestId);
      const bodies = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
      expect(bodies[0]).toEqual({ breweryId: "brewery-id", name: "invite_staff", input, requestId });
      expect(bodies[1]).toEqual(bodies[0]);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects a malformed JSON body with 400 invalid_request", async () => {
    const req = new Request("http://localhost/api/command", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json() as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("invalid_request");
  });

  it("rejects an oversized command before authentication or dispatch", async () => {
    executionHandler.mockClear();
    const prefix = JSON.stringify({ breweryId, name: "execution_metadata_probe", input: {}, requestId: randomUUID() });
    const req = new Request("http://localhost/api/command", {
      method: "POST", headers: { "content-type": "application/json" },
      body: prefix + " ".repeat(MAX_COMMAND_BODY_BYTES),
    });
    expect((await POST(req)).status).toBe(413);
    expect(executionHandler).not.toHaveBeenCalled();
  });

  it.each([
    [502, async () => ({ unexpected: true })],
    [504, async () => { throw new SyntaxError("Unexpected token <"); }],
  ])("browser client rejects a non-envelope response (%i) instead of crashing on its shape", async (status, json) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json }));
    try {
      await expect(command("brewery-id", "upsert_brand", { name: "Pils" })).rejects.toThrow(`malformed response (${status})`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runs a query without a request id and returns a correlation id", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_brands", input: {} }, adminToken));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, correlationId: expect.any(String) });
    expect(json.requestId).toBeUndefined();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("rejects a missing command request id without calling the handler", async () => {
    const res = await POST(commandReq({
      breweryId,
      name: "execution_metadata_probe",
      input: {},
    }, adminToken));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request_id", message: expect.any(String) },
      correlationId: expect.any(String),
    });
    expect(executionHandler).not.toHaveBeenCalled();
  });

  it("rejects a malformed command request id without calling the handler", async () => {
    const res = await POST(commandReq({
      breweryId,
      name: "execution_metadata_probe",
      input: {},
      requestId: "not-a-uuid",
    }, adminToken));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_request_id", message: expect.any(String) },
      requestId: "not-a-uuid",
      correlationId: expect.any(String),
    });
    expect(executionHandler).not.toHaveBeenCalled();
  });

  it("accepts a UUIDv7 command request id and passes response metadata to the handler", async () => {
    const requestId = "018f46c6-9c3e-7c4b-8a59-7a4a8e66f923";
    const res = await POST(commandReq({
      breweryId,
      name: "execution_metadata_probe",
      input: {},
      requestId,
    }, adminToken));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, requestId, correlationId: expect.any(String) });
    expect(json.correlationId).not.toBe(requestId);
    expect(executionHandler).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {},
      { requestId, correlationId: json.correlationId },
    );
  });

  it("rejects a bad token", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_brands", input: {} }, "not-a-jwt"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ ok: false, error: { message: "unauthenticated" }, correlationId: expect.any(String) });
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_brands", input: {} }, ""));
    expect(res.status).toBe(401);
  });

  it("rejects a valid user who is not a member", async () => {
    const other = await makeStaff((await makeBrewery()).id, "admin");
    const res = await POST(commandReq({ breweryId, name: "list_brands", input: {} }, await signIn(other.email)));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ ok: false, error: { message: "not a member of this brewery" }, correlationId: expect.any(String) });
  });

  it("treats a non-UUID breweryId as not-a-member, never a 500", async () => {
    const res = await POST(commandReq({ breweryId: "not-a-uuid", name: "list_brands", input: {} }, adminToken));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: { message: "not a member of this brewery" }, correlationId: expect.any(String) });
  });

  it("rejects a command the role cannot run", async () => {
    const res = await POST(commandReq({
      breweryId,
      name: "upsert_brand",
      input: { name: "Nope" },
      requestId: randomUUID(),
    }, warehouseToken));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json).toMatchObject({
      ok: false,
      error: { code: "permission_denied", message: expect.any(String) },
      correlationId: expect.any(String),
    });
  });

  it("returns Retry-After and never dispatches or claims a business request when admission is denied", async () => {
    executionHandler.mockClear();
    sql(`insert into private.command_admissions(user_id,window_started_at,request_count) values ('${adminId}',now(),120)
      on conflict(user_id) do update set window_started_at=now(),request_count=120`);
    const requestId = randomUUID();
    const res = await POST(commandReq({ breweryId, name: "execution_metadata_probe", input: {}, requestId }, adminToken));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: { code: "rate_limited" }, requestId, correlationId: expect.any(String) });
    expect(executionHandler).not.toHaveBeenCalled();
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
    sql(`delete from private.command_admissions where user_id='${adminId}'`);
  });

  it("applies admission to authenticated pretenant requests", async () => {
    sql(`insert into private.command_admissions(user_id,window_started_at,request_count) values ('${adminId}',now(),120)
      on conflict(user_id) do update set window_started_at=now(),request_count=120`);
    const res = await POST(commandReq({ name: "provision_brewery", input: { name: "Never created", timezone: "America/New_York" }, requestId: randomUUID() }, adminToken));
    expect(res.status).toBe(429);
    sql(`delete from private.command_admissions where user_id='${adminId}'`);
  });

  it("rejects a rendered actor mismatch before invoking the handler", async () => {
    executionHandler.mockClear();
    const res = await POST(commandReq({
      breweryId,
      name: "execution_metadata_probe",
      input: {},
      requestId: randomUUID(),
      expectedContext: { actorId: randomUUID(), breweryId },
    }, adminToken));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "context_changed", message: "Signed-in account or active workspace changed. Return to the original context to retry this unchanged action." },
    });
    expect(executionHandler).not.toHaveBeenCalled();
  });

  it("recovers actor A's result after an authorized actor B is refused", async () => {
    const requestId = randomUUID();
    const body = {
      breweryId,
      name: "upsert_brand",
      input: { name: `Frozen-${requestId}` },
      requestId,
      expectedContext: { actorId: adminId, breweryId },
    };
    const first = await POST(commandReq(body, adminToken));
    expect(first.status).toBe(200);
    const original = await first.json();

    expect((await POST(commandReq(body, secondAdminToken))).status).toBe(409);
    await expect((await POST(commandReq(body, adminToken))).json()).resolves.toMatchObject({
      ok: true, data: original.data, requestId,
    });
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["1"]);
  });
});
