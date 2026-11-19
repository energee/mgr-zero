import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { numberedHistorySchema, readHistory, type HistoryRow } from "@/lib/commands/history";
import type { Database } from "@/lib/supabase/database";

const row = (n: number): HistoryRow => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, created_at: "2026-09-20T12:00:00.123456Z" });

function transport(responses: Response[]) {
  const requests: { url: URL; headers: Headers }[] = [];
  const db = createClient<Database>("https://history.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(typeof input === "string" || input instanceof URL ? input : input.url), headers: new Headers(init?.headers) });
      const response = responses.shift();
      if (!response) throw new Error("Unexpected history request");
      return response;
    } },
  });
  return { db, requests };
}

const counted = (rows: HistoryRow[], total: number) => new Response(JSON.stringify(rows), {
  headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, rows.length - 1)}/${total}` },
});
const failure = (code: string, status: number) => new Response(JSON.stringify({ code, message: "Database read failed", details: "" }), {
  status, headers: { "content-type": "application/json" },
});

it("requests only the numbered range with exact count and stable ordering", async () => {
  const { db, requests } = transport([counted([row(6), row(5)], 10)]);
  const query = db.from("orders").select("*, shipments!inner(deliveries!inner(outcome))", { count: "exact" })
    .eq("brewery_id", "brewery").eq("status", "shipped").in("shipments.deliveries.outcome", ["delivered", "partial"]).limit(3);
  expect(await readHistory(query, { page: 3, limit: 2 })).toEqual({ rows: [row(6), row(5)], total: 10, nextCursor: `${row(5).created_at}~${row(5).id}` });
  expect(requests).toHaveLength(1);
  expect(requests[0].url.searchParams.get("offset")).toBe("4");
  expect(requests[0].url.searchParams.get("limit")).toBe("2");
  expect(requests[0].url.searchParams.get("order")).toBe("created_at.desc,id.desc");
  expect(requests[0].headers.get("prefer")).toContain("count=exact");
});

it("recovers a 416 with a single bounded read preserving all filters and joins", async () => {
  const { db, requests } = transport([failure("PGRST103", 416), counted([row(6)], 10)]);
  const query = db.from("orders").select("*, shipments!inner(deliveries!inner(outcome))", { count: "exact" })
    .eq("brewery_id", "brewery").eq("customer_id", "customer").eq("status", "shipped")
    .in("shipments.deliveries.outcome", ["delivered", "partial"]).limit(3);
  expect(await readHistory(query, { page: 1_000_000, limit: 2 })).toEqual({ rows: [], total: 10, nextCursor: null });
  expect(requests).toHaveLength(2);
  expect(requests[0].url.searchParams.get("offset")).toBe("1999998");
  expect(requests[1].url.searchParams.get("offset")).toBe("0");
  expect(requests[1].url.searchParams.get("limit")).toBe("1");
  for (const key of ["select", "brewery_id", "customer_id", "status", "shipments.deliveries.outcome", "order"]) {
    expect(requests[1].url.searchParams.get(key)).toBe(requests[0].url.searchParams.get(key));
  }
});

it("retains cursor lookahead without adding a count or offset", async () => {
  const { db, requests } = transport([new Response(JSON.stringify([row(4), row(3), row(2)]))]);
  const cursor = `${row(5).created_at}~${row(5).id}`;
  expect(await readHistory(db.from("orders").select("*").limit(3), { limit: 2, cursor }))
    .toEqual({ rows: [row(4), row(3)], nextCursor: `${row(3).created_at}~${row(3).id}` });
  expect(requests[0].url.searchParams.get("limit")).toBe("3");
  expect(requests[0].url.searchParams.has("offset")).toBe(false);
  expect(requests[0].url.searchParams.get("or")).toContain(row(5).created_at);
  expect(requests[0].headers.get("prefer") ?? "").not.toContain("count=exact");
});

it("does not turn unrelated or recovery database failures into empty pages", async () => {
  for (const responses of [[failure("42501", 403)], [failure("PGRST103", 416), failure("42501", 403)]]) {
    const { db } = transport(responses);
    await expect(readHistory(db.from("orders").select("*", { count: "exact" }).limit(3), { page: 2, limit: 2 }))
      .rejects.toMatchObject({ code: "permission_denied" });
  }
});

it("rejects cursor/page ambiguity", () => {
  const schema = numberedHistorySchema({});
  expect(schema.parse({ page: 1_000_000 })).toMatchObject({ page: 1_000_000, limit: 50 });
  expect(schema.safeParse({ page: 1, cursor: `${row(5).created_at}~${row(5).id}` }).success).toBe(false);
});

it("requires the server's exact total rather than silently inventing one", async () => {
  const { db } = transport([new Response(JSON.stringify([row(4), row(3)]))]);
  await expect(readHistory(db.from("orders").select("*").limit(3), { page: 2, limit: 2 }))
    .rejects.toMatchObject({ code: "query_failed", message: "History total unavailable" });
});
