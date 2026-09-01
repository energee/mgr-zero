// tests/chat-oauth.test.ts — Slack installation lifecycle: admin-only OAuth start,
// hashed ten-minute state, exact redirect binding, idempotent activation, scope
// checks, reconciliation, and disable-first disconnect (live DB, fake Slack port).
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import {
  REQUIRED_SLACK_SCOPES,
  beginSlackInstall,
  beginSlackReauthorization,
  completeSlackInstall,
  disconnectSlackInstallation,
  reconcileSlackInstall,
  type SlackOAuthPort,
} from "@/lib/chat/oauth";

process.env.SLACK_CLIENT_ID ??= "test-client-id";

const REDIRECT = "https://mgr.test/api/chat/slack/oauth";

function fakePort(overrides: Partial<SlackOAuthPort> = {}, teamId = `T${crypto.randomUUID().slice(0, 8)}`) {
  const stored = new Map<string, { botToken: string }>();
  const port: SlackOAuthPort = {
    handleOAuthCallback: vi.fn(async () => {
      stored.set(teamId, { botToken: "xoxb-fake" });
      return { teamId, isEnterpriseInstall: false, teamName: "Demo Brewing", scopes: [...REQUIRED_SLACK_SCOPES] };
    }),
    getInstallation: vi.fn(async (id: string) => stored.get(id) ?? null),
    deleteInstallation: vi.fn(async (id: string) => { stored.delete(id); }),
    ...overrides,
  };
  return { port, teamId, stored };
}

const callback = (authorizeUrl: string, redirect = REDIRECT) => {
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  return new Request(`${redirect}?code=fake-code&state=${encodeURIComponent(state)}`);
};

const row = async (id: string) => (await admin.from("chat_installations").select().eq("id", id).single()).data!;

describe("Slack installation lifecycle", () => {
  let b: { id: string };
  beforeAll(async () => {
    b = await makeBrewery();
  });

  it("only an admin may start an installation", async () => {
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    await expect(beginSlackInstall(warehouse, REDIRECT)).rejects.toThrow(/permission/i);
  });

  it("stores a hashed ten-minute intent and redirects with exact scopes and redirect URI", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("scope")).toBe(REQUIRED_SLACK_SCOPES.join(","));
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    const state = url.searchParams.get("state")!;
    const r = await row(installationId);
    expect(r.state).toBe("pending");
    expect(r.oauth_intent_hash).toBe(createHash("sha256").update(state).digest("hex"));
    expect(JSON.stringify(r)).not.toContain(state);
    const ttl = new Date(r.oauth_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(11 * 60_000); // DB clock vs. JS clock skew
  });

  it("activates the installation once and replays the callback idempotently", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port, teamId } = fakePort();
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    const req = callback(authorizeUrl);
    const first = await completeSlackInstall(ctx.db, req, port, REDIRECT);
    expect(first).toEqual({ installationId, breweryId: brewery.id, replayed: false });
    const r = await row(installationId);
    expect(r.state).toBe("active");
    expect(r.external_installation_id).toBe(teamId);
    expect(r.oauth_consumed_at).not.toBeNull();
    const second = await completeSlackInstall(ctx.db, req, port, REDIRECT);
    expect(second.replayed).toBe(true);
    expect(port.handleOAuthCallback).toHaveBeenCalledTimes(1);
  });

  it("rejects forged state and a redirect URI that differs from the intent", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port } = fakePort();
    await expect(completeSlackInstall(ctx.db, new Request(`${REDIRECT}?code=x&state=forged`), port, REDIRECT)).rejects.toThrow(/state/i);
    const { authorizeUrl } = await beginSlackInstall(ctx, REDIRECT);
    await expect(completeSlackInstall(ctx.db, callback(authorizeUrl), port, "https://evil.test/cb")).rejects.toThrow(/redirect/i);
    expect(port.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a callback from an installer whose membership was removed", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port } = fakePort();
    const { authorizeUrl } = await beginSlackInstall(ctx, REDIRECT);
    await admin.from("brewery_users").delete().eq("user_id", ctx.userId).eq("brewery_id", brewery.id);
    await expect(completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT)).rejects.toThrow(/state/i);
    expect(port.handleOAuthCallback).not.toHaveBeenCalled();
  });

  it("refuses a workspace already active for another brewery and deletes the orphaned credential", async () => {
    const { port, teamId } = fakePort();
    const first = await makeStaffCtx((await makeBrewery()).id);
    await completeSlackInstall(first.db, callback((await beginSlackInstall(first, REDIRECT)).authorizeUrl), port, REDIRECT);
    const second = await makeStaffCtx((await makeBrewery()).id);
    const { authorizeUrl, installationId } = await beginSlackInstall(second, REDIRECT);
    await expect(completeSlackInstall(second.db, callback(authorizeUrl), port, REDIRECT)).rejects.toThrow(/another brewery/i);
    expect(port.deleteInstallation).toHaveBeenCalledWith(teamId);
    expect((await row(installationId)).state).toBe("pending");
  });

  it("rejects a scope mismatch and removes the stored credential", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port } = fakePort({
      handleOAuthCallback: vi.fn(async () => ({ teamId: "TSCOPE", isEnterpriseInstall: false, scopes: ["chat:write"] })),
    });
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    await expect(completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT)).rejects.toThrow(/scope/i);
    expect(port.deleteInstallation).toHaveBeenCalledWith("TSCOPE");
    expect((await row(installationId)).state).toBe("pending");
  });

  it("binds reauthorization to the existing installation and workspace", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port, teamId } = fakePort();
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    await completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT);
    await admin.from("chat_installations").update({ state: "needs_reauthorization", last_failure_code: "token_revoked" }).eq("id", installationId);

    const other = await makeStaffCtx((await makeBrewery()).id);
    await expect(beginSlackReauthorization(other, installationId, REDIRECT)).rejects.toThrow(/permission|not found/i);

    const reauth = await beginSlackReauthorization(ctx, installationId, REDIRECT);
    expect(reauth.installationId).toBe(installationId);
    expect((await row(installationId)).state).toBe("needs_reauthorization");

    const wrongWorkspace = fakePort({}, "TOTHER").port;
    await expect(completeSlackInstall(ctx.db, callback(reauth.authorizeUrl), wrongWorkspace, REDIRECT)).rejects.toThrow(/different workspace/i);
    expect(wrongWorkspace.deleteInstallation).toHaveBeenCalledWith("TOTHER");

    const again = await beginSlackReauthorization(ctx, installationId, REDIRECT);
    const done = await completeSlackInstall(ctx.db, callback(again.authorizeUrl), fakePort({}, teamId).port, REDIRECT);
    expect(done).toEqual({ installationId, breweryId: brewery.id, replayed: false });
    const r = await row(installationId);
    expect(r.state).toBe("active");
    expect(r.last_failure_code).toBeNull();
  });

  it("reconciles a partial installation by deleting the orphaned credential", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port, teamId, stored } = fakePort();
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    // Simulate a crash between token storage and MGR activation.
    await port.handleOAuthCallback(callback(authorizeUrl), { redirectUri: REDIRECT });
    await admin.from("chat_installations").update({ external_installation_id: teamId }).eq("id", installationId);
    expect(stored.has(teamId)).toBe(true);
    const outcome = await reconcileSlackInstall(admin, installationId, port);
    expect(outcome).toEqual({ credentialDeleted: true });
    expect(stored.has(teamId)).toBe(false);
    expect((await row(installationId)).oauth_reconciled_at).not.toBeNull();
  });

  it("disconnects by disabling first, invalidating links/destinations, then deleting the credential", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port, teamId, stored } = fakePort();
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    await completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT);
    const link = await admin.from("chat_user_links").insert({
      brewery_id: brewery.id, installation_id: installationId, provider: "slack", external_user_id: "U1", user_id: ctx.userId, state: "active", linked_at: new Date().toISOString(),
    }).select().single();
    if (link.error) throw link.error;
    const dest = await admin.from("notification_destinations").insert({
      brewery_id: brewery.id, installation_id: installationId, kind: "private_channel", external_destination_id: "C1", privacy_class: "private_internal",
    }).select().single();
    if (dest.error) throw dest.error;

    const warehouse = await makeStaffCtx(brewery.id, "warehouse");
    await expect(disconnectSlackInstallation(warehouse, installationId, port)).rejects.toThrow(/permission/i);

    const outcome = await disconnectSlackInstallation(ctx, installationId, port);
    expect(outcome).toEqual({ credentialDeleted: true });
    expect(stored.has(teamId)).toBe(false);
    const r = await row(installationId);
    expect(r.state).toBe("disconnected");
    expect(r.disabled_at).not.toBeNull();
    expect(r.disconnected_at).not.toBeNull();
    expect(r.oauth_intent_hash).toBeNull();
    expect((await admin.from("chat_user_links").select("state").eq("id", link.data.id).single()).data?.state).toBe("unlinked");
    expect((await admin.from("notification_destinations").select("state, blocked_reason").eq("id", dest.data.id).single()).data)
      .toEqual({ state: "blocked", blocked_reason: "installation_disconnected" });
  });

  it("keeps the installation disconnected and records the failure when credential deletion fails", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port } = fakePort({ deleteInstallation: vi.fn(async () => { throw new Error("slack down"); }) });
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    await completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT);
    const outcome = await disconnectSlackInstallation(ctx, installationId, port);
    expect(outcome).toEqual({ credentialDeleted: false });
    const r = await row(installationId);
    expect(r.state).toBe("disconnected");
    expect(r.last_failure_code).toBe("credential_delete_failed");
    expect(r.oauth_reconciled_at).toBeNull();
  });
});
