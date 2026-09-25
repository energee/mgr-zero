// tests/chat-route-admission.test.ts — proves POST /api/chat spends the same per-user
// command admission budget as /api/command and refuses with 429 before any model or history work (#459).
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
import { publicEnv } from "@/lib/env/public";

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
    request.db = await asUser(staff.email);
    sql(`insert into private.command_admissions(user_id,window_started_at,request_count) values ('${staff.id}',now(),120)
      on conflict(user_id) do update set window_started_at=now(),request_count=120`);
    try {
      const res = await POST(chatReq(brewery.id, crypto.randomUUID()));
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/too many requests/i) });
    } finally {
      sql(`delete from private.command_admissions where user_id='${staff.id}'`);
    }
  });
});
