// tests/chat-webhook.test.ts — Slack webhook contract: signature/timestamp
// verification, URL verification, fast acknowledgement, durable App Home
// receipts keyed by event_id (duplicates coalesce), and no receipt for an
// installation that is not active. Runs the real Chat SDK route with a
// restricted chat_sdk state role (live DB).
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { admin, makeBrewery, makeStaff } from "./helpers";

const adminUrl = process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const sql = new pg.Pool({ connectionString: adminUrl });
const role = `mgr_chat_webhook_${process.pid}`;
const password = crypto.randomUUID();
const SIGNING = "test-signing-secret";
let POST: (req: Request) => Promise<Response>;
let teamId: string, installationId: string, breweryId: string;

function signed(body: string, opts: { ts?: number; secret?: string } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = "v0=" + createHmac("sha256", opts.secret ?? SIGNING).update(`v0:${ts}:${body}`).digest("hex");
  return new Request("https://mgr.test/api/webhooks/slack", {
    method: "POST", body,
    headers: { "content-type": "application/json", "x-slack-request-timestamp": String(ts), "x-slack-signature": sig },
  });
}
const homeOpened = (eventId: string, user = "U100", team = teamId, tab = "home") => JSON.stringify({
  type: "event_callback", team_id: team, event_id: eventId, event_time: Math.floor(Date.now() / 1000), api_app_id: "A1",
  event: { type: "app_home_opened", user, channel: "D100", tab, event_ts: "1.000" },
});
const receipts = async () => (await admin.from("chat_callback_receipts").select().eq("installation_id", installationId).order("received_at")).data!;

beforeAll(async () => {
  await sql.query(`create role ${role} login password '${password}'`);
  await sql.query(`grant mgr_chat_sdk to ${role}`);
  const stateUrl = new URL(adminUrl); stateUrl.username = role; stateUrl.password = password;
  process.env.CHAT_STATE_DATABASE_URL = stateUrl.toString();
  process.env.CHAT_STATE_KEY_PREFIX = `mgr-webhook-${process.pid}`;
  process.env.SLACK_CLIENT_ID = "client"; process.env.SLACK_CLIENT_SECRET = "secret";
  process.env.SLACK_SIGNING_SECRET = SIGNING; process.env.CHAT_SDK_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.APP_URL = "https://mgr.test";

  const b = await makeBrewery(); breweryId = b.id;
  const staff = await makeStaff(b.id);
  teamId = `T${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await admin.from("chat_installations").insert({
    brewery_id: b.id, provider: "slack", external_installation_id: teamId, display_label: "Demo", state: "active",
    installer_user_id: staff.id, token_store_key: `slack:installation:${teamId}`,
  }).select().single();
  if (error) throw error;
  installationId = data.id;

  ({ POST } = await import("@/app/api/webhooks/slack/route"));
  const { slackAdapter, chatReady } = await import("@/lib/chat/slack-adapter");
  await chatReady();
  await slackAdapter().setInstallation(teamId, { botToken: "xoxb-test-token", botUserId: "B1", teamName: "Demo" });
});

afterAll(async () => {
  const { chatStatePool } = await import("@/lib/chat/state");
  await chatStatePool().end().catch(() => undefined);
  await sql.query(`revoke mgr_chat_sdk from ${role}`);
  await sql.query(`drop role if exists ${role}`);
  await sql.end();
});

describe("Slack webhook", () => {
  it("answers URL verification with the challenge", async () => {
    const res = await POST(signed(JSON.stringify({ type: "url_verification", challenge: "abc123" })));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("abc123");
  });

  it("rejects a bad signature and a stale timestamp without recording anything", async () => {
    const before = (await receipts()).length;
    expect((await POST(signed(homeOpened("Ev-bad"), { secret: "wrong" }))).status).toBeGreaterThanOrEqual(400);
    expect((await POST(signed(homeOpened("Ev-old"), { ts: Math.floor(Date.now() / 1000) - 60 * 60 }))).status).toBeGreaterThanOrEqual(400);
    expect((await receipts()).length).toBe(before);
  });

  it("acknowledges an App Home open fast and records one pending receipt per event_id", async () => {
    const started = Date.now();
    const res = await POST(signed(homeOpened("Ev-1")));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(3000);
    await POST(signed(homeOpened("Ev-1"))); // Slack retry: same event_id
    const rows = (await receipts()).filter((r) => r.callback_id === "Ev-1");
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ brewery_id: breweryId, provider: "slack", callback_kind: "app_home_opened", disposition: "pending", external_user_id: "U100" });
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows[0])).not.toContain("xoxb");
  });

  it("ignores the Messages tab and unknown or inactive installations", async () => {
    const before = (await receipts()).length;
    expect((await POST(signed(homeOpened("Ev-msgs", "U100", teamId, "messages")))).status).toBe(200);
    expect((await POST(signed(homeOpened("Ev-unknown", "U100", "TUNKNOWN")))).status).toBeLessThan(500);
    await admin.from("chat_installations").update({ state: "disabled", disabled_at: new Date().toISOString() }).eq("id", installationId);
    expect((await POST(signed(homeOpened("Ev-disabled")))).status).toBeLessThan(500);
    await admin.from("chat_installations").update({ state: "active", disabled_at: null }).eq("id", installationId);
    expect((await receipts()).length).toBe(before);
  });
});
