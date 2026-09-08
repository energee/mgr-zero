// tests/chat-oauth.test.ts — Slack installation lifecycle: admin-only OAuth start,
// hashed ten-minute state, exact redirect binding, idempotent activation, scope
// checks, reconciliation, and disable-first disconnect (live DB, fake Slack port).
import { createHash } from "node:crypto";
import { WebClient } from "@slack/web-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, makeBrewery, makeStaffCtx, DB, sql } from "./helpers";
import {
  REQUIRED_SLACK_SCOPES,
  beginSlackInstall,
  beginSlackReauthorization,
  completeSlackInstall,
  disconnectSlackInstallation,
  reconcileSlackInstall,
  type SlackOAuthPort,
} from "@/lib/chat/oauth";

const sdkRole = "chat_oauth_test";
beforeAll(() => {
  expect(new URL(DB).port).toBe(process.env.CI === "true" ? "54342" : "54352");
  sql(`set client_min_messages=warning; drop role if exists ${sdkRole}; create role ${sdkRole} login password 'oauth-test-password'; grant mgr_chat_sdk to ${sdkRole}`);
  const url = new URL(DB); url.username = sdkRole; url.password = "oauth-test-password";
  process.env.CHAT_STATE_DATABASE_URL = url.toString();
});
afterAll(async () => {
  await (await import("@/lib/chat/state")).chatStatePool().end();
  sql(`set client_min_messages=warning; drop role if exists ${sdkRole}`);
});

process.env.SLACK_CLIENT_ID ??= "test-client-id";

const REDIRECT = "https://mgr.test/api/chat/slack/oauth";

function fakePort(overrides: Partial<SlackOAuthPort> = {}, teamId = `T${crypto.randomUUID().slice(0, 8)}`) {
  const stored = new Map<string, { botToken: string }>();
  const port: SlackOAuthPort = {
    handleOAuthCallback: vi.fn(async () => {
      return { teamId, isEnterpriseInstall: false, teamName: "Demo Brewing", scopes: [...REQUIRED_SLACK_SCOPES],
        persist: async () => { stored.set(teamId, { botToken: "xoxb-fake" }); } };
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

  it.each(["active", "disabled", "needs_reauthorization"])("preserves the exact credential and mapping of an existing %s workspace owner", async (state) => {
    const { port, teamId, stored } = fakePort();
    const first = await makeStaffCtx((await makeBrewery()).id);
    const initial = await beginSlackInstall(first, REDIRECT);
    await completeSlackInstall(first.db, callback(initial.authorizeUrl), port, REDIRECT);
    stored.set(teamId, { botToken: "xoxb-original-owner" });
    expect((await admin.from("chat_installations").update({ state }).eq("id", initial.installationId)).error).toBeNull();
    const original = await row(initial.installationId);
    const second = await makeStaffCtx((await makeBrewery()).id);
    const { authorizeUrl, installationId } = await beginSlackInstall(second, REDIRECT);
    await expect(completeSlackInstall(second.db, callback(authorizeUrl), port, REDIRECT)).rejects.toThrow();
    expect(stored.get(teamId)).toEqual({ botToken: "xoxb-original-owner" });
    expect(await row(initial.installationId)).toEqual(original);
    expect(port.deleteInstallation).not.toHaveBeenCalled();
    expect((await row(installationId)).state).toBe("pending");
  });

  it("rejects a scope mismatch without touching stored credentials", async () => {
    const brewery = await makeBrewery();
    const ctx = await makeStaffCtx(brewery.id);
    const { port } = fakePort({
      handleOAuthCallback: vi.fn(async () => ({ teamId: "TSCOPE", isEnterpriseInstall: false, scopes: ["chat:write"], persist: vi.fn() })),
    });
    const { authorizeUrl, installationId } = await beginSlackInstall(ctx, REDIRECT);
    await expect(completeSlackInstall(ctx.db, callback(authorizeUrl), port, REDIRECT)).rejects.toThrow(/scope/i);
    expect(port.deleteInstallation).not.toHaveBeenCalled();
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
    expect(wrongWorkspace.deleteInstallation).not.toHaveBeenCalled();

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
    await (await port.handleOAuthCallback(callback(authorizeUrl), { redirectUri: REDIRECT })).persist();
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

it("orders a delayed credential delete before a concurrent OAuth store and activation", async () => {
  const b = await makeBrewery(), ctx = await makeStaffCtx(b.id);
  const first = fakePort();
  const initial = await beginSlackInstall(ctx, REDIRECT);
  await completeSlackInstall(ctx.db, callback(initial.authorizeUrl), first.port, REDIRECT);
  let started!: () => void, release!: () => void;
  const deleting = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const originalDelete = first.port.deleteInstallation;
  const port = { deleteInstallation: async (id: string) => { started(); await gate; await originalDelete(id); } };
  const disconnect = disconnectSlackInstallation(ctx, initial.installationId, port);
  await deleting;
  const next = await beginSlackInstall(ctx, REDIRECT);
  const activate = completeSlackInstall(ctx.db, callback(next.authorizeUrl), first.port, REDIRECT);
  // Wait for a second real connection to reach the advisory lock, not a timer guess.
  let waiting = false;
  for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
    waiting = sql("select count(*) from pg_locks where locktype='advisory' and not granted")[0] !== "0";
    if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try {
    expect(waiting).toBe(true);
    expect(first.port.handleOAuthCallback).toHaveBeenCalledTimes(1);
  } finally { release(); }
  expect(await disconnect).toEqual({ credentialDeleted: true });
  await activate;
  expect(first.stored.has(first.teamId)).toBe(true);
  expect((await row(next.installationId)).state).toBe("active");
  await disconnectSlackInstallation(ctx, initial.installationId, first.port);
  expect(first.stored.has(first.teamId)).toBe(true);
});

it.each([
  ["disabled", "disconnect"], ["needs_reauthorization", "disconnect"],
  ["disabled", "reconcile"], ["needs_reauthorization", "reconcile"],
] as const)("preserves replacement workspace credentials in %s during old %s cleanup", async (state, cleanup) => {
  const breweryA = await makeBrewery(), ownerA = await makeStaffCtx(breweryA.id);
  const { port, teamId, stored } = fakePort();
  const first = await beginSlackInstall(ownerA, REDIRECT);
  await completeSlackInstall(ownerA.db, callback(first.authorizeUrl), port, REDIRECT);
  await disconnectSlackInstallation(ownerA, first.installationId, port);
  const breweryB = await makeBrewery(), ownerB = await makeStaffCtx(breweryB.id);
  const replacement = await beginSlackInstall(ownerB, REDIRECT);
  await completeSlackInstall(ownerB.db, callback(replacement.authorizeUrl), port, REDIRECT);
  stored.set(teamId, { botToken: "xoxb-replacement" });
  const changed = await admin.from("chat_installations").update({ state }).eq("id", replacement.installationId);
  expect(changed.error).toBeNull();
  const calls = vi.mocked(port.deleteInstallation).mock.calls.length;
  const result = cleanup === "disconnect"
    ? await disconnectSlackInstallation(ownerA, first.installationId, port)
    : await reconcileSlackInstall(admin, first.installationId, port);
  expect(result).toEqual({ credentialDeleted: false });
  expect(port.deleteInstallation).toHaveBeenCalledTimes(calls);
  expect(stored.get(teamId)).toEqual({ botToken: "xoxb-replacement" });
  expect((await row(replacement.installationId)).state).toBe(state);
});

it("preserves both owners on wrong-workspace reauthorization and on activation rejection", async () => {
  const { port, stored, teamId } = fakePort();
  const first = await makeStaffCtx((await makeBrewery()).id);
  const initial = await beginSlackInstall(first, REDIRECT);
  await completeSlackInstall(first.db, callback(initial.authorizeUrl), port, REDIRECT);
  stored.set(teamId, { botToken: "xoxb-keep" });
  const other = await makeStaffCtx((await makeBrewery()).id);
  const second = fakePort();
  const otherInitial = await beginSlackInstall(other, REDIRECT);
  await completeSlackInstall(other.db, callback(otherInitial.authorizeUrl), second.port, REDIRECT);
  const reauth = await beginSlackReauthorization(other, otherInitial.installationId, REDIRECT);
  const original = await row(initial.installationId), otherOriginal = await row(otherInitial.installationId);
  await expect(completeSlackInstall(other.db, callback(reauth.authorizeUrl), port, REDIRECT)).rejects.toThrow(/different workspace/);
  expect(stored.get(teamId)).toEqual({ botToken: "xoxb-keep" });
  expect(await row(initial.installationId)).toEqual(original);
  expect(await row(otherInitial.installationId)).toEqual(otherOriginal);
  expect(second.stored.get(second.teamId)).toEqual({ botToken: "xoxb-fake" });
  // Membership disappears during exchange, after the initial intent check.
  const next = await beginSlackReauthorization(first, initial.installationId, REDIRECT);
  const exchange = port.handleOAuthCallback;
  port.handleOAuthCallback = async (request, options) => {
    const staged = await exchange(request, options);
    await admin.from("brewery_users").delete().eq("user_id", first.userId).eq("brewery_id", first.breweryId);
    return staged;
  };
  await expect(completeSlackInstall(first.db, callback(next.authorizeUrl), port, REDIRECT)).rejects.toThrow();
  expect(stored.get(teamId)).toEqual({ botToken: "xoxb-keep" });
});

it("records failed final persistence as reauthorization required without a successful replay", async () => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const { port, stored } = fakePort();
  const exchange = port.handleOAuthCallback;
  port.handleOAuthCallback = async (request, options) => ({ ...await exchange(request, options), persist: async () => { throw new Error("store unavailable"); } });
  const initial = await beginSlackInstall(ctx, REDIRECT);
  await expect(completeSlackInstall(ctx.db, callback(initial.authorizeUrl), port, REDIRECT)).rejects.toThrow(/Reauthorize/);
  expect(await row(initial.installationId)).toMatchObject({ state: "needs_reauthorization", last_failure_code: "credential_store_failed" });
  expect(stored.size).toBe(0);
  await expect(completeSlackInstall(ctx.db, callback(initial.authorizeUrl), port, REDIRECT)).rejects.toThrow(/already used/);
});

it.each([false, true])("holds real adapter token consumers until staged persistence finishes (failure=%s)", async (fails) => {
  process.env.SLACK_CLIENT_SECRET = "test-secret";
  process.env.SLACK_SIGNING_SECRET = "test-signing";
  process.env.CHAT_SDK_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const { slackAdapter, slackOAuthPort, slackClientFor, slackPrivateChannels, chatReady } = await import("@/lib/chat/slack-adapter");
  await chatReady();
  const slack = slackAdapter(), teamId = `T-${crypto.randomUUID()}`;
  const send = vi.fn();
  const exchange = vi.spyOn(WebClient.prototype, "apiCall").mockImplementation(async (method, options) => {
    if (method === "oauth.v2.access") return { ok: true, access_token: "xoxb-staged", team: { id: teamId, name: "Staged" }, scope: REQUIRED_SLACK_SCOPES.join(","), bot_user_id: "B1" };
    if (method === "auth.test") return { ok: true, response_metadata: { scopes: [...REQUIRED_SLACK_SCOPES] } };
    if (method === "conversations.list") return { ok: true, channels: [] };
    if (method === "chat.postMessage") { send(options); return { ok: true, channel: "D-stage", ts: "1" }; }
    throw new Error(`unexpected provider call ${method}`);
  });
  const rawStore = slack.setInstallation.bind(slack);
  let started!: () => void, release!: () => void;
  const storing = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const persist = vi.spyOn(slack, "setInstallation").mockImplementation(async (id, installation) => {
    started(); await gate;
    if (fails) throw new Error("store unavailable");
    await rawStore(id, installation);
  });
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const initial = await beginSlackInstall(ctx, REDIRECT);
  const activation = completeSlackInstall(ctx.db, callback(initial.authorizeUrl), slackOAuthPort(), REDIRECT).then(() => "active", () => "failed");
  await storing;
  expect((await row(initial.installationId)).state).toBe("active");
  expect(await slack.getInstallation(teamId)).toBeNull();
  const sending = slackClientFor(teamId).postMessage({ channel: "D-stage", text: "test", blocks: [] }).then(() => "sent", () => "blocked");
  let waiting = false;
  for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
    waiting = sql("select count(*) from pg_locks where locktype='advisory' and not granted")[0] !== "0";
    if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
  }
  try { expect(waiting).toBe(true); expect(send).not.toHaveBeenCalled(); }
  finally { release(); }
  expect(await activation).toBe(fails ? "failed" : "active");
  expect(await sending).toBe(fails ? "blocked" : "sent");
  expect(send).toHaveBeenCalledTimes(fails ? 0 : 1);
  if (!fails) expect(send).toHaveBeenCalledWith(expect.objectContaining({ token: "xoxb-staged" }));
  expect((await row(initial.installationId)).state).toBe(fails ? "needs_reauthorization" : "active");
  if (!fails) {
    const before = await slack.getInstallation(teamId);
    expect(before).toEqual({ botToken: "xoxb-staged", botUserId: "B1", teamName: "Staged" });
    expect(await slackPrivateChannels(teamId)).toEqual([]);
    await Promise.all(Array.from({ length: 6 }, () => slackClientFor(teamId).postMessage({ channel: "D-stage", text: "parallel", blocks: [] })));
    expect(send).toHaveBeenCalledTimes(7);
    const other = await makeStaffCtx((await makeBrewery()).id);
    const rejected = await beginSlackInstall(other, REDIRECT);
    await expect(completeSlackInstall(other.db, callback(rejected.authorizeUrl), slackOAuthPort(), REDIRECT)).rejects.toThrow(/another brewery/);
    expect(await slack.getInstallation(teamId)).toEqual(before);
    expect(persist).toHaveBeenCalledTimes(1);
  }
  exchange.mockRestore(); persist.mockRestore();
});

it("does not replay success after activation lost its credential before persistence", async () => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const { port, stored } = fakePort();
  const initial = await beginSlackInstall(ctx, REDIRECT);
  await completeSlackInstall(ctx.db, callback(initial.authorizeUrl), port, REDIRECT);
  stored.clear(); // Durable activation survived a process exit; no shared credential did.
  await expect(completeSlackInstall(ctx.db, callback(initial.authorizeUrl), port, REDIRECT)).rejects.toThrow(/Reauthorize/);
  expect(await row(initial.installationId)).toMatchObject({ state: "needs_reauthorization", last_failure_code: "credential_store_failed" });
  expect(port.handleOAuthCallback).toHaveBeenCalledTimes(1);
});
