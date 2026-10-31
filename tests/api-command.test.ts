import type { Database } from "@/lib/supabase/database";
// tests/api-command.test.ts — verifies typed command/query envelopes over POST /api/command.
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { command } from "@/lib/commands/client";
import { type CommandExecution, type Ctx, defineCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
import { MAX_COMMAND_BODY_BYTES } from "@/lib/commands/request-limits";
import { makeBrewery, makeStaff, seedCatalog, sql } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function signIn(email: string) {
  const c = createClient<Database>(URL, ANON, { auth: { persistSession: false } });
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
  const chatExecutionHandler = vi.fn(async (_ctx: Ctx, _input: Record<string, never>, execution: CommandExecution) => execution);

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
    defineCommand({
      name: "chat_execution_probe", input: z.object({}), roles: ["admin"], aiExposed: true,
      risk: "append_only", requiresConfirmation: true, compensation: null,
      idempotency: "dedupe", offlineReplay: false, atomicity: "rpc",
      preview: async () => ({ effects: [], warnings: [], version: {} }),
      handler: chatExecutionHandler,
    });
  });

  it("enforces browser Origin and JSON media type before authenticated dispatch", async () => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    try {
      const foreign = commandReq({ breweryId, name: "list_brands", input: {} }, adminToken);
      foreign.headers.set("origin", "https://attacker.invalid");
      const deniedOrigin = await POST(foreign);
      expect(deniedOrigin.status).toBe(403);
      expect(await deniedOrigin.json()).toMatchObject({ ok: false, error: { code: "invalid_origin" }, correlationId: expect.any(String) });
      const formBody = commandReq({ breweryId, name: "list_brands", input: {} }, adminToken);
      formBody.headers.set("content-type", "text/plain");
      const deniedType = await POST(formBody);
      expect(deniedType.status).toBe(415);
      expect(await deniedType.json()).toMatchObject({ ok: false, error: { code: "unsupported_media_type" }, correlationId: expect.any(String) });
      const trusted = commandReq({ breweryId, name: "list_brands", input: {} }, adminToken);
      trusted.headers.set("origin", "https://mgr.test");
      expect((await POST(trusted)).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns schema field paths separately from its customer-facing summary", async () => {
    const res = await POST(commandReq({ breweryId, name: "search_entities", input: { q: "x".repeat(81) } }, adminToken));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: expect.stringContaining("80"),
        issues: [{ path: ["q"], code: "too_big", message: expect.any(String) }],
      },
      correlationId: expect.any(String),
    });
  });

  it("retains an unmapped public filing reason over the real API without filing or claiming a request", async () => {
    const requestId = randomUUID();
    const before = sql(`select count(*) from report_filings where brewery_id='${breweryId}'`);
    const res = await POST(commandReq({
      breweryId, name: "file_compliance_report", requestId,
      input: { jurisdiction: "TTB", periodStart: "2025-09-15", periodEnd: "2025-10-15" },
    }, adminToken));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false, requestId,
      error: {
        code: "invalid_input",
        message: expect.stringMatching(/one calendar month, quarter, or year/),
        issues: [{ path: ["periodEnd"], code: "custom", message: expect.stringMatching(/one calendar month, quarter, or year/) }],
      },
    });
    expect(sql(`select count(*) from report_filings where brewery_id='${breweryId}'`)).toEqual(before);
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
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

  it("serializes and propagates chat preview provenance with the expected context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ ok: true, data: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    const conversationId = randomUUID();
    const previewToken = randomUUID();
    try {
      await command("brewery-id", "record_movement", {}, randomUUID(), {
        actorId: "00000000-0000-4000-8000-000000000001", breweryId: "brewery-id",
      }, { origin: "chat", conversationId, previewToken });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({ origin: "chat", conversationId, previewToken, expectedContext: { breweryId: "brewery-id" } });
    } finally { vi.unstubAllGlobals(); }
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
    // #1490: the stages a hosted save splits into, durations only.
    expect(res.headers.get("server-timing")).toMatch(/^auth;dur=[\d.]+, admission;dur=[\d.]+, command;dur=[\d.]+$/);
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
    const [, input, execution] = executionHandler.mock.calls.at(-1)!;
    expect(input).toEqual({});
    expect(execution).toEqual({ requestId, correlationId: json.correlationId, origin: "ui" });
  });

  it("passes chat provenance only to an exposed confirmed command and rejects missing preview metadata", async () => {
    const conversationId = randomUUID();
    const previewToken = randomUUID();
    const requestId = randomUUID();
    const accepted = await POST(commandReq({ breweryId, name: "chat_execution_probe", input: {}, requestId,
      origin: "chat", conversationId, previewToken, expectedContext: { actorId: adminId, breweryId } }, adminToken));
    expect(accepted.status).toBe(200);
    expect(chatExecutionHandler).toHaveBeenCalledWith(expect.anything(), {}, expect.objectContaining({
      requestId, origin: "chat", conversationId, previewToken,
    }));

    const refused = await POST(commandReq({ breweryId, name: "execution_metadata_probe", input: {}, requestId: randomUUID(),
      origin: "chat", conversationId }, adminToken));
    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toMatchObject({ ok: false, error: { code: "preview_required" } });

    const uiWithChatToken = await POST(commandReq({ breweryId, name: "execution_metadata_probe", input: {}, requestId: randomUUID(),
      origin: "ui", conversationId, previewToken }, adminToken));
    expect(uiWithChatToken.status).toBe(400);
    await expect(uiWithChatToken.json()).resolves.toMatchObject({ ok: false, error: { code: "preview_required" } });
  });

  it("rejects a bad token", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_brands", input: {} }, "not-a-jwt"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toMatchObject({ ok: false, error: { message: "unauthenticated" }, correlationId: expect.any(String) });
    // A failed stage is still timed; the stages after it never ran.
    expect(res.headers.get("server-timing")).toMatch(/^auth;dur=[\d.]+$/);
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
    expect(res.headers.get("server-timing")).toMatch(/^auth;dur=[\d.]+, admission;dur=[\d.]+$/);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: { code: "rate_limited" }, requestId, correlationId: expect.any(String) });
    expect(executionHandler).not.toHaveBeenCalled();
    expect(sql(`select count(*) from private.command_requests where request_id='${requestId}'`)).toEqual(["0"]);
    sql(`delete from private.command_admissions where user_id='${adminId}'`);
  });

  it("serves stored COLA labels after the budget is spent, but still limits TTB fetches", async () => {
    const ttbId = "99001001000001";
    const url = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=SampleLabel.jpg&filetype=l";
    const dataUrl = "data:image/jpeg;base64,/9j/2Q==";
    const { brandId } = await seedCatalog(breweryId);
    sql(`update public.breweries set ttb_registry_no='BR-PA-12345' where id='${breweryId}'`);
    const saved = await POST(commandReq({
      breweryId, name: "upsert_brand_approval", requestId: randomUUID(),
      input: { brandId, kind: "cola", ttbId, approvedOn: "2023-01-24", imageUrl: url },
    }, adminToken));
    expect(saved.status).toBe(200);
    sql(`select public.store_cola_label_image('${breweryId}','${ttbId}','${url}','${dataUrl}');
      insert into private.command_admissions(user_id,window_started_at,request_count) values ('${adminId}',now(),120)
      on conflict(user_id) do update set window_started_at=now(),request_count=120`);
    try {
      const cached = await POST(commandReq({ breweryId, name: "get_cola_image", input: { ttbId, url } }, adminToken));
      expect(cached.status).toBe(200);
      await expect(cached.json()).resolves.toMatchObject({ ok: true, data: { dataUrl } });
      expect(sql(`select request_count from private.command_admissions where user_id='${adminId}'`)).toEqual(["120"]);
      const uncached = await POST(commandReq({
        breweryId, name: "get_cola_image", input: { ttbId, url: url.replace("SampleLabel.jpg", "Other.jpg") },
      }, adminToken));
      expect(uncached.status).toBe(429);
      expect(Number(uncached.headers.get("retry-after"))).toBeGreaterThan(0);
      await expect(uncached.json()).resolves.toMatchObject({ ok: false, error: { code: "rate_limited" } });
    } finally {
      sql(`delete from private.command_admissions where user_id='${adminId}'`);
    }
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
