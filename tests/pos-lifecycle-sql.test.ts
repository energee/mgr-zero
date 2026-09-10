import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { beginSquareOAuth, refreshSquareTokens, SquareClient } from "@/lib/pos";
import { disconnectSquare, readVersionedIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const };

describe("Square durable credential lifecycle", () => {
  it("binds OAuth state to its initiating Admin and current role", async () => {
    const brewery = await makeBrewery();
    const adminCtx = await makeStaffCtx(brewery.id, "admin");
    const other = await makeStaffCtx(brewery.id, "admin");
    const authorize = new URL((await beginSquareOAuth(adminCtx, new SquareClient(config, vi.fn()), "connect", crypto.randomUUID())).authorizeUrl);

    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: other.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
    expect((await admin.from("brewery_users").update({ role: "warehouse" }).eq("brewery_id", brewery.id).eq("user_id", adminCtx.userId)).error).toBeNull();
    expect((await admin.rpc("claim_square_oauth", { p_state_hash: hash(authorize.searchParams.get("state")!),
      p_actor: adminCtx.userId, p_brewery: brewery.id, p_redirect_uri: config.redirectUri })).data).toEqual([]);
  });

  it("purges locally before revoke and rejects a refresh response arriving after disconnect", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id, "admin");
    const connection = await admin.from("pos_connections").insert({ brewery_id: brewery.id, merchant_id: `merchant-${crypto.randomUUID()}`,
      state: "connected", credential_version: 1, access_expires_at: "2026-01-01T00:00:00Z" }).select("id,merchant_id").single();
    expect(connection.error).toBeNull();
    sql(`insert into private.integration_tokens(brewery_id,provider,connection_id,access_token,refresh_token,credential_version)
      values('${brewery.id}','square','${connection.data!.id}','old-access','old-refresh',1)`);

    let release!: (response: Response) => void;
    const refreshFetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = refreshSquareTokens(ctx, new SquareClient(config, refreshFetch));
    await vi.waitFor(() => expect(refreshFetch).toHaveBeenCalledTimes(1));

    const requestId = crypto.randomUUID();
    const revoke = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(disconnectSquare(ctx, connection.data!.id, revoke, requestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(revoke).toHaveBeenCalledWith("old-access");
    expect(sql(`select count(*) from private.integration_tokens where brewery_id='${brewery.id}' and provider='square'`)).toEqual(["0"]);

    release(new Response(JSON.stringify({ access_token: "late-access", refresh_token: "late-refresh",
      expires_at: "2026-11-01T00:00:00Z", merchant_id: connection.data!.merchant_id }), { status: 200 }));
    await expect(pending).rejects.toThrow("Square is unavailable");
    await expect(readVersionedIntegrationTokens(ctx, "square")).rejects.toMatchObject({ status: 404 });

    const replayRevoke = vi.fn();
    await expect(disconnectSquare(ctx, connection.data!.id, replayRevoke, requestId)).resolves.toEqual({
      disconnected: true, remoteRevocationState: "unresolved",
    });
    expect(replayRevoke).not.toHaveBeenCalled();
    expect((await admin.from("pos_connections").select("state,remote_revocation_state,last_error").eq("id", connection.data!.id).single()).data)
      .toEqual({ state: "recovery_required", remote_revocation_state: "unresolved", last_error: "Remote revocation could not be confirmed" });
  });
});
