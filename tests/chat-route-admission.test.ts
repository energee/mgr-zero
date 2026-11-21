// tests/chat-route-admission.test.ts — proves POST /api/chat spends the same per-user
// command admission budget as /api/command and refuses with 429 before any model or history work (#459),
// and that Ask MGR answers only a platform super admin (auth app_metadata.superadmin).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asUser, makeBrewery, makeStaff, sql } from "./helpers";

const request = vi.hoisted(() => ({ db: undefined as SupabaseClient<Database> | undefined }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => request.db),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

import { POST } from "@/app/api/chat/route";
import { createRequestAuthContext } from "@/lib/auth/request-context";

function makeSuperadmin(userId: string) {
  sql(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"superadmin":true}' where id='${userId}'`);
}

afterEach(() => {
  request.db = undefined;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function chatReq(breweryId: string, conversationId: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: conversationId,
      breweryId,
      message: { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "How many kegs of IPA?" }] },
    }),
  });
}

describe("POST /api/chat admission", () => {
  it("returns 429 with Retry-After before any history or model work when the caller's admission budget is spent", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    makeSuperadmin(staff.id);
    request.db = await asUser(staff.email);
    sql(`insert into private.command_admissions(user_id,window_started_at,request_count) values ('${staff.id}',now(),120)
      on conflict(user_id) do update set window_started_at=now(),request_count=120`);
    try {
      const res = await POST(chatReq(brewery.id, crypto.randomUUID()));
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      await expect(res.text()).resolves.toBe("mgr-chat:rate_limited");
    } finally {
      sql(`delete from private.command_admissions where user_id='${staff.id}'`);
    }
  });
});

describe("Ask MGR super admin gate", () => {
  it("reads superadmin from the session's app_metadata, and nothing else grants it", async () => {
    const identity = (claims: object) => createRequestAuthContext(async () => ({ auth: { getClaims: async () => ({ data: { claims }, error: null }) } }) as never).getIdentity();
    expect(await identity({ sub: "u", app_metadata: { superadmin: true } })).toMatchObject({ superadmin: true });
    expect(await identity({ sub: "u", user_metadata: { superadmin: true } })).toMatchObject({ superadmin: false });
    expect(await identity({ sub: "u" })).toMatchObject({ superadmin: false });
  });

  it("refuses a brewery admin who is not a super admin with 403 before spending admission", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id, "admin");
    request.db = await asUser(staff.email);
    const res = await POST(chatReq(brewery.id, crypto.randomUUID()));
    expect(res.status).toBe(403);
    // An unknown conversation is also a 403, but only after admission is spent.
    expect(sql(`select count(*) from private.command_admissions where user_id='${staff.id}'`, true)).toEqual(["0"]);
  });
});
