// tests/api-command.test.ts — POST /api/command with a Supabase Bearer token.
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { POST } from "@/app/api/command/route";
import { makeBrewery, makeStaff } from "./helpers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54341";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    const admin = await makeStaff(breweryId, "admin");
    const warehouse = await makeStaff(breweryId, "warehouse");
    adminToken = await signIn(admin.email);
    warehouseToken = await signIn(warehouse.email);
  });

  it("runs a query with a valid access token", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, adminToken));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("rejects a bad token", async () => {
    const res = await POST(commandReq({ breweryId, name: "list_products", input: {} }, "not-a-jwt"));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "unauthenticated" });
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
    expect(json).toEqual({ ok: false, error: "not a member of this brewery" });
  });

  it("rejects a command the role cannot run", async () => {
    const res = await POST(commandReq({ breweryId, name: "create_product", input: { name: "Nope" } }, warehouseToken));
    expect(res.status).toBe(403);
  });
});
