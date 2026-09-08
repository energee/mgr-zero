// tests/chat-webhook.test.ts — Slack webhook contract: signature/timestamp
// verification, URL verification, fast acknowledgement, durable App Home
// receipts keyed by event_id (duplicates coalesce), and no receipt for an
// installation that is not active. Runs the real Chat SDK route with a
// restricted chat_sdk state role (live DB).
import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { DB, admin, ins, makeBrewery, makeStaff } from "./helpers";

const adminUrl = DB;
const sql = new pg.Pool({ connectionString: adminUrl });
const role = `mgr_chat_webhook_${process.pid}`;
const password = crypto.randomUUID();
const SIGNING = "test-signing-secret";
let POST: (req: Request) => Promise<Response>;
let teamId: string, installationId: string, breweryId: string, actorId: string;

function signed(body: string, opts: { ts?: number; secret?: string; form?: boolean } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig = "v0=" + createHmac("sha256", opts.secret ?? SIGNING).update(`v0:${ts}:${body}`).digest("hex");
  return new Request("https://mgr.test/api/webhooks/slack", {
    method: "POST", body,
    headers: { "content-type": opts.form ? "application/x-www-form-urlencoded" : "application/json", "x-slack-request-timestamp": String(ts), "x-slack-signature": sig },
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
  const staff = await makeStaff(b.id); actorId = staff.id;
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


const actionBody = (intent: string, action = "mgr_refresh", user = "U-ACTIONS") => new URLSearchParams({ payload: JSON.stringify({
  type: "block_actions", team: { id: teamId }, user: { id: user }, container: { type: "view" },
  trigger_id: "trigger-test", actions: [{ action_id: action, value: intent }],
}) }).toString();
async function issue(action: string) {
  const r = await admin.rpc("issue_chat_action_intent", { p_installation: installationId, p_external_user_id: "U-ACTIONS", p_action: action, p_delivery: null });
  if (r.error) throw r.error; return r.data as string;
}
describe("receipt-first Slack actions", () => {
  beforeAll(async () => {
    await ins("chat_user_links", { brewery_id: breweryId, installation_id: installationId, provider: "slack", external_user_id: "U-ACTIONS", user_id: actorId, state: "active", linked_at: new Date().toISOString() });
  });
  it("requires exact raw signature before receipt and queues one refresh on replay", async () => {
    const intent = await issue("mgr_refresh");
    const raw = actionBody(intent);
    expect((await POST(signed(raw, { form: true, secret: "wrong" }))).status).toBe(401);
    expect((await POST(signed(raw, { form: true, ts: Math.floor(Date.now()/1000)-301 }))).status).toBe(401);
    expect((await receipts()).filter(r => r.callback_kind === "mgr_refresh")).toHaveLength(0);
    expect((await POST(signed(raw, { form: true }))).status).toBe(200);
    expect((await POST(signed(raw, { form: true }))).status).toBe(200);
    const rs = (await receipts()).filter(r => r.callback_kind === "mgr_refresh");
    expect(rs).toHaveLength(1); expect(rs[0].disposition).toBe("processed");
    expect((await receipts()).filter(r => r.callback_id === `action-home:${rs[0].id}`)).toHaveLength(1);
    expect(JSON.stringify(rs)).not.toContain("trigger-test");
  });
  it("opens preferences with only opaque metadata and saves validated mute/quiet hours after a receipt", async () => {
    const { slackAdapter } = await import("@/lib/chat/slack-adapter");
    const webClient = await slackAdapter().withBotToken("xoxb-test-token", async () => slackAdapter().webClient);
    const open = vi.spyOn(webClient.views, "open").mockImplementation(async (args) => {
      expect((await receipts()).some(r => r.callback_kind === "mgr_preferences" && r.disposition === "processed")).toBe(true);
      expect((args as { trigger_id?: string })?.trigger_id).toBe("trigger-test");
      return { ok: true, view: { id: "VTEST" } } as never;
    });
    try {
      const token = await issue("mgr_preferences");
      expect((await POST(signed(actionBody(token,"mgr_preferences"), { form: true }))).status).toBe(200);
      expect(open).toHaveBeenCalledOnce();
      const view = open.mock.calls[0][0]!.view as { private_metadata: string };
      expect(view.private_metadata).toMatch(/^[0-9a-f-]{36}$/);
      expect(view.private_metadata).not.toBe(token);
      const modal = (timezone = "America/New_York") => new URLSearchParams({payload: JSON.stringify({
        type: "view_submission", team: {id:teamId}, user: {id:"U-ACTIONS"},
        view: {id:"VTEST",callback_id:"mgr_save_preferences",private_metadata:view.private_metadata,state:{values:{
          reason:{reason:{selected_option:{value:"invoice_question"}}},enabled:{enabled:{selected_option:{value:"false"}}},
          start:{start:{value:"22:00"}},end:{end:{value:"08:00"}},timezone:{timezone:{value:timezone}},
        }}},
      })}).toString();
      const invalid = await POST(signed(modal("Invalid/Zone"), {form:true}));
      expect(await invalid.text()).toContain("errors");
      const valid = modal();
      expect((await POST(signed(valid,{form:true}))).status).toBe(200);
      expect((await POST(signed(valid,{form:true}))).status).toBe(200);
      const pref = (await admin.from("notification_preferences").select().eq("brewery_id",breweryId).eq("user_id",actorId).eq("reason","invoice_question").single()).data!;
      expect(pref).toMatchObject({enabled:false,quiet_hours_start:"22:00:00",quiet_hours_end:"08:00:00",quiet_hours_timezone:"America/New_York"});
      expect(JSON.stringify((await receipts()).filter(r=>r.callback_kind==="mgr_save_preferences"))).not.toContain("America/New_York");
    } finally { open.mockRestore(); }
  });
  it("returns 503 on a durable mutation failure and retries once without worker theft", async () => {
    const token = await issue("mgr_unlink");
    const raw = actionBody(token,"mgr_unlink");
    expect(new URL(adminUrl).port).toBe(process.env.CI === "true" ? "54342" : "54352");
    // A real PostgreSQL failure after receipt insertion and before intent commit.
    await sql.query(`create function public.test_chat_action_failure() returns trigger language plpgsql set search_path='' as $$ begin
      if new.user_id='${actorId}'::uuid and new.state='unlinked' then raise exception 'test_action_failure'; end if; return new; end $$`);
    await sql.query(`create trigger test_chat_action_failure before update on public.chat_user_links for each row execute function public.test_chat_action_failure()`);
    const quiet = vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      expect((await POST(signed(raw,{form:true}))).status).toBe(503);
      const pending = (await receipts()).find(r=>r.callback_kind==="mgr_unlink")!;
      expect(pending.disposition).toBe("pending");
      const claims = await admin.rpc("claim_chat_callback_receipts", {p_limit:100,p_now:new Date().toISOString()});
      expect(claims.error).toBeNull();
      expect(claims.data.map((r:{id:string})=>r.id)).not.toContain(pending.id);
    } finally {
      quiet.mockRestore();
      await sql.query("drop trigger test_chat_action_failure on public.chat_user_links");
      await sql.query("drop function public.test_chat_action_failure()");
    }
    expect((await POST(signed(raw,{form:true}))).status).toBe(200);
    expect((await POST(signed(raw,{form:true}))).status).toBe(200);
    const rows=(await receipts()).filter(r=>r.callback_kind==="mgr_unlink");
    expect(rows).toHaveLength(1);expect(rows[0].disposition).toBe("processed");
    expect((await admin.from("chat_user_links").select("state").eq("installation_id",installationId).eq("external_user_id","U-ACTIONS").single()).data?.state).toBe("unlinked");
  });
});
