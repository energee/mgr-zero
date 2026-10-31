import { describe, expect, it, vi } from "vitest";
import { beginQboOAuth, QboOAuthClient } from "@/lib/qbo";
import { beginSquareOAuth, SquareClient } from "@/lib/pos";
import { beginSlackInstall, beginSlackReauthorization } from "@/lib/chat/oauth";
import { sha256 } from "@/lib/hash";
import { admin, makeBrewery, makeStaffCtx, sql } from "./helpers";

const redirectUri = "https://mgr.test/oauth";
const qbo = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri, apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com" }, vi.fn());
const square = new SquareClient({ applicationId: "id", applicationSecret: "secret", redirectUri, environment: "sandbox" }, vi.fn());

describe("server-random OAuth starts", () => {
  for (const provider of ["qbo", "square"] as const) {
    it(`${provider} rotates only a pending retry's digest without extending expiry or duplicating the intent`, async () => {
      const brewery = await makeBrewery();
      const ctx = await makeStaffCtx(brewery.id);
      const requestId = "00000000-0000-4000-8000-000000000001";
      const begin = () => provider === "qbo"
        ? beginQboOAuth(ctx, qbo, "connect", requestId)
        : beginSquareOAuth(ctx, square, "connect", requestId);
      const first = new URL((await begin()).authorizeUrl).searchParams.get("state")!;
      expect(Buffer.from(first, "base64url")).toHaveLength(32);
      expect(first).not.toBe(sha256(`${requestId}:${ctx.userId}`));
      const table = provider === "qbo" ? "qbo_oauth_intents" : "square_oauth_intents";
      const initial = sql(`select id::text || ':' || expires_at::text from private.${table} where brewery_id='${brewery.id}'`);
      const second = new URL((await begin()).authorizeUrl).searchParams.get("state")!;
      expect(second).not.toBe(first);
      expect(sql(`select id::text || ':' || expires_at::text from private.${table} where brewery_id='${brewery.id}'`)).toEqual(initial);
      expect(sql(`select state_hash from private.${table} where brewery_id='${brewery.id}'`)).toEqual([sha256(second)]);
      expect(sql(`select count(*) from private.${table} where state_hash='${sha256(first)}'`)).toEqual(["0"]);
      const persisted = sql(`select row_to_json(i)::text from private.${table} i where brewery_id='${brewery.id}'`);
      expect(persisted.join()).not.toContain(second);
      sql(`update private.${table} set consumed_at=now(),exchange_state='exchanging' where brewery_id='${brewery.id}'`);
      await expect(begin()).rejects.toMatchObject({ status: 409 });
      expect(sql(`select state_hash from private.${table} where brewery_id='${brewery.id}'`)).toEqual([sha256(second)]);
      sql(`update private.${table} set consumed_at=null,exchange_state='pending',expires_at=now()-interval '1 minute' where brewery_id='${brewery.id}'`);
      await expect(begin()).rejects.toMatchObject({ status: 409 });
    });
  }

  it.each(["install", "reauthorize"] as const)("rotates a pending Slack %s retry and rejects superseded attempts", async (kind) => {
    process.env.SLACK_CLIENT_ID = "id";
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const requestId = crypto.randomUUID();
    let installationId: string | undefined;
    if (kind === "reauthorize") {
      const created = await beginSlackInstall(ctx, redirectUri);
      installationId = created.installationId;
      const result = await admin.from("chat_installations").update({ state: "active", external_installation_id: `T-${crypto.randomUUID()}` }).eq("id", installationId);
      expect(result.error).toBeNull();
    }
    const begin = () => installationId
      ? beginSlackReauthorization(ctx, installationId, redirectUri, requestId)
      : beginSlackInstall(ctx, redirectUri, requestId);
    const first = await begin();
    const before = (await admin.from("chat_installations").select("oauth_expires_at").eq("id", first.installationId).single()).data!;
    const second = await begin();
    const state = new URL(second.authorizeUrl).searchParams.get("state")!;
    expect(Buffer.from(state, "base64url")).toHaveLength(32);
    expect(second.installationId).toBe(first.installationId);
    expect(second.authorizeUrl).not.toBe(first.authorizeUrl);
    const persisted = (await admin.from("chat_installations").select("oauth_intent_hash,oauth_expires_at,oauth_request_id").eq("id", first.installationId).single()).data;
    expect(persisted).toEqual({ oauth_intent_hash: sha256(state), oauth_expires_at: before.oauth_expires_at, oauth_request_id: requestId });
    // A newer command on the reused installation must not be overwritten by an old retry.
    const newer = installationId
      ? await beginSlackReauthorization(ctx, installationId, redirectUri, crypto.randomUUID())
      : await beginSlackInstall(ctx, redirectUri, crypto.randomUUID());
    await expect(begin()).rejects.toMatchObject({ status: 409 });
    expect((await admin.from("chat_installations").select("oauth_intent_hash").eq("id", first.installationId).single()).data?.oauth_intent_hash)
      .toBe(sha256(new URL(newer.authorizeUrl).searchParams.get("state")!));
  });
});
