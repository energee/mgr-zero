// tests/api-command.test.ts — verifies typed command/query envelopes over POST /api/command.
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { command } from "@/lib/commands/client";
import { type CommandExecution, type Ctx, defineCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
import { makeBrewery, makeStaff } from "./helpers";

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
  let warehouseToken: string;
  const executionHandler = vi.fn(async (_ctx: Ctx, _input: Record<string, never>, execution: CommandExecution) => execution);

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    const admin = await makeStaff(breweryId, "admin");
    const warehouse = await makeStaff(breweryId, "warehouse");
    adminToken = await signIn(admin.email);
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
      await expect(command("brewery-id", "create_product", { name: "Pils" })).resolves.toEqual({ created: true });
      const [, options] = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(options.body) as { requestId: string };
      expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it.each([
    [502, async () => ({ unexpected: true })],
    [504, async () => { throw new SyntaxError("Unexpected token <"); }],
  ])("browser client rejects a non-envelope response (%i) instead of crashing on its shape", async (status, json) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, json }));
    try {
      await expect(command("brewery-id", "create_product", { name: "Pils" })).rejects.toThrow(`malformed response (${status})`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runs a query without a request id and returns a correlation id", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, adminToken));
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
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, "not-a-jwt"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ ok: false, error: { message: "unauthenticated" }, correlationId: expect.any(String) });
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, ""));
    expect(res.status).toBe(401);
  });

  it("rejects a valid user who is not a member", async () => {
    const other = await makeStaff((await makeBrewery()).id, "admin");
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, await signIn(other.email)));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ ok: false, error: { message: "not a member of this brewery" }, correlationId: expect.any(String) });
  });

  it("rejects a command the role cannot run", async () => {
    const res = await POST(commandReq({
      breweryId,
      name: "create_product",
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
});
