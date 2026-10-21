// tests/qbo-refresh-lease.test.ts — issue #1032: a QuickBooks refresh lease left
// by a crashed or failed holder must not block later refreshes. The concurrent
// case (one caller waits for the other) is in qbo-lifecycle-sql.test.ts and
// qbo-pay.test.ts.
import { describe, expect, it, vi } from "vitest";
import { QboOAuthClient, refreshQboCredentials } from "@/lib/qbo";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

async function connection() {
  const brewery = await makeBrewery();
  const ctx = await makeStaffCtx(brewery.id, "sales");
  const row = await admin.from("qbo_connections").insert({
    brewery_id: brewery.id, realm_id: `realm-${crypto.randomUUID()}`, state: "connected",
    access_expires_at: "2026-01-01T00:00:00Z",
  }).select("id").single();
  if (row.error) throw row.error;
  sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token)
    values('${brewery.id}','qbo','${row.data.id}','old-access','old-refresh')`);
  return { ctx, connectionId: row.data.id };
}

const rotated = (n: number) => Response.json({
  access_token: `rotated-access-${n}`, refresh_token: `rotated-refresh-${n}`, expires_in: 3600,
});

const lease = (connectionId: string) => sql(`select coalesce(refresh_leased_until::text,'none')
  from private.integration_tokens where connection_id='${connectionId}'`)[0];

describe("QuickBooks refresh lease (#1032)", { concurrent: false }, () => {
  it("refreshes past a lease that a crashed holder left behind once it expires", async () => {
    const { ctx, connectionId } = await connection();
    sql(`update private.integration_tokens set refresh_lease=gen_random_uuid(),
      refresh_leased_until=now()-interval '1 second' where connection_id='${connectionId}'`);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => rotated(1));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, fetch)))
      .resolves.toMatchObject({ refreshToken: "rotated-refresh-1" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("releases the lease when the provider refresh fails, so the next caller does not wait", async () => {
    const { ctx, connectionId } = await connection();
    const down = vi.fn<typeof globalThis.fetch>(async () => new Response("unavailable", { status: 503 }));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, down))).rejects.toThrow("QuickBooks is unavailable");
    expect(lease(connectionId)).toBe("none");
    const up = vi.fn<typeof globalThis.fetch>(async () => rotated(2));
    await expect(refreshQboCredentials(ctx, new QboOAuthClient(config, up)))
      .resolves.toMatchObject({ refreshToken: "rotated-refresh-2" });
  });

  it("keeps the lease functions service-only", () => {
    expect(sql(`select r.role from unnest(array['anon','authenticated']) r(role)
      where has_function_privilege(r.role,'public.lease_qbo_token_refresh(uuid,uuid,bigint,uuid)','execute')
         or has_function_privilege(r.role,'public.release_qbo_token_refresh(uuid,uuid,uuid)','execute')`)).toEqual([]);
  });
});
